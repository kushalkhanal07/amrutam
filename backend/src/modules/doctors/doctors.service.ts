import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DoctorVerificationStatus, Prisma, Role, SlotStatus } from '@prisma/client';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { SearchDoctorsQueryDto, UpdateDoctorProfileDto, UpsertDoctorProfileDto } from './dto/doctors.dto';

/** Public doctor view: profile name only, never email or account details. */
export const publicDoctorSelect = {
  id: true,
  specialization: true,
  qualifications: true,
  bio: true,
  yearsOfExperience: true,
  languages: true,
  consultationFeeMinor: true,
  currency: true,
  verificationStatus: true,
  ratingAverage: true,
  ratingCount: true,
  createdAt: true,
  user: { select: { profile: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.DoctorSelect;

const sortMap: Record<SearchDoctorsQueryDto['sortBy'], Prisma.DoctorOrderByWithRelationInput> = {
  fee: { consultationFeeMinor: 'asc' },
  experience: { yearsOfExperience: 'asc' },
  rating: { ratingAverage: 'asc' },
  createdAt: { createdAt: 'asc' },
};

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(query: SearchDoctorsQueryDto) {
    const where: Prisma.DoctorWhereInput = {
      verificationStatus: DoctorVerificationStatus.VERIFIED,
      user: { status: 'ACTIVE' },
    };
    if (query.specialization) where.specialization = { equals: query.specialization, mode: 'insensitive' };
    if (query.language) where.languages = { has: query.language };
    if (query.maxFeeMinor !== undefined) where.consultationFeeMinor = { lte: query.maxFeeMinor };
    if (query.minExperience !== undefined) where.yearsOfExperience = { gte: query.minExperience };
    if (query.q) {
      where.OR = [
        { bio: { contains: query.q, mode: 'insensitive' } },
        { user: { profile: { firstName: { contains: query.q, mode: 'insensitive' } } } },
        { user: { profile: { lastName: { contains: query.q, mode: 'insensitive' } } } },
      ];
    }
    if (query.availableOnly || query.availableFrom || query.availableTo) {
      where.slots = {
        some: {
          status: SlotStatus.AVAILABLE,
          startsAt: {
            gte: query.availableFrom ? new Date(query.availableFrom) : new Date(),
            lte: query.availableTo ? new Date(query.availableTo) : undefined,
          },
        },
      };
    }

    const orderField = sortMap[query.sortBy];
    const orderBy: Prisma.DoctorOrderByWithRelationInput[] = [
      Object.fromEntries(Object.entries(orderField).map(([k]) => [k, query.sortDir])),
      { id: 'asc' }, // stable pagination
    ];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        where,
        select: publicDoctorSelect,
        orderBy,
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.doctor.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  async findPublic(id: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id }, select: publicDoctorSelect });
    if (!doctor) {
      throw new NotFoundException('Doctor not found');
    }
    return doctor;
  }

  async findByUserId(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId }, select: publicDoctorSelect });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found. Create it with POST /doctors/me');
    }
    return doctor;
  }

  /** Doctor id for a doctor user, or 404. Used by other modules for ownership checks. */
  async requireDoctorIdForUser(userId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }
    return doctor.id;
  }

  async createProfile(userId: string, dto: UpsertDoctorProfileDto) {
    const existing = await this.prisma.doctor.findUnique({ where: { userId }, select: { id: true } });
    if (existing) {
      throw new ConflictException('Doctor profile already exists. Use PATCH /doctors/me');
    }
    await this.prisma.doctor.create({ data: { userId, ...dto } });
    return this.findByUserId(userId);
  }

  async updateProfile(userId: string, dto: UpdateDoctorProfileDto) {
    await this.requireDoctorIdForUser(userId);
    await this.prisma.doctor.update({ where: { userId }, data: dto });
    return this.findByUserId(userId);
  }

  async setVerification(
    actorId: string,
    doctorId: string,
    status: DoctorVerificationStatus,
    ctx: RequestContext,
  ) {
    const before = await this.findPublic(doctorId);
    await this.prisma.$transaction(async (tx) => {
      await tx.doctor.update({ where: { id: doctorId }, data: { verificationStatus: status } });
      await this.audit.record(
        {
          action: AuditAction.DOCTOR_VERIFIED,
          entityType: 'Doctor',
          entityId: doctorId,
          actorId,
          actorRole: Role.ADMIN,
          metadata: { from: before.verificationStatus, to: status },
          context: ctx,
        },
        tx,
      );
    });
    return this.findPublic(doctorId);
  }
}
