import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { RequestContext } from '../../common/decorators/request-context.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditAction, AuditService } from '../audit-logs/audit.service';
import { ListUsersQueryDto, UpdateProfileDto } from './dto/users.dto';

/** Fields that are safe to return to clients. Never includes passwordHash or mfaSecret. */
export const safeUserSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: { firstName: true, lastName: true, phone: true, dateOfBirth: true, gender: true, timezone: true },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: safeUserSelect });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.prisma.profile.update({
      where: { userId },
      data: { ...dto, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined },
    });
    return this.findById(userId);
  }

  async list(query: ListUsersQueryDto) {
    const where: Prisma.UserWhereInput = { role: query.role, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  async changeRole(actorId: string, targetId: string, role: Role, ctx: RequestContext) {
    if (actorId === targetId) {
      throw new BadRequestException('You cannot change your own role');
    }
    const before = await this.findById(targetId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetId }, data: { role } });
      await this.audit.record(
        {
          action: AuditAction.USER_ROLE_CHANGED,
          entityType: 'User',
          entityId: targetId,
          actorId,
          actorRole: Role.ADMIN,
          metadata: { from: before.role, to: role },
          context: ctx,
        },
        tx,
      );
    });
    return this.findById(targetId);
  }

  async changeStatus(actorId: string, targetId: string, status: UserStatus, ctx: RequestContext) {
    if (actorId === targetId) {
      throw new BadRequestException('You cannot change your own status');
    }
    const before = await this.findById(targetId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetId }, data: { status } });
      if (status === UserStatus.SUSPENDED) {
        // Suspension also ends every session.
        await tx.refreshToken.updateMany({
          where: { userId: targetId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(
        {
          action: AuditAction.USER_STATUS_CHANGED,
          entityType: 'User',
          entityId: targetId,
          actorId,
          actorRole: Role.ADMIN,
          metadata: { from: before.status, to: status },
          context: ctx,
        },
        tx,
      );
    });
    return this.findById(targetId);
  }
}
