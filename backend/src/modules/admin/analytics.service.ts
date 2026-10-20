import { BadRequestException, Injectable } from '@nestjs/common';
import { ConsultationStatus, PaymentStatus, SlotStatus } from '@prisma/client';
import { paginate } from '../../common/dto/pagination.dto';
import { addDays } from '../../common/utils/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalyticsRangeDto, DoctorUtilizationQueryDto } from './dto/analytics.dto';

const MAX_RANGE_DAYS = 366;

/** Aggregate-only queries. No row-level medical data leaves this service. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AnalyticsRangeDto) {
    const { from, to } = this.range(query);
    const createdIn = { createdAt: { gte: from, lte: to } };

    const [byStatus, cancellations, usersByRole, paymentsByStatus, revenue, slots] = await Promise.all([
      this.prisma.consultation.groupBy({ by: ['status'], where: createdIn, _count: { _all: true } }),
      this.prisma.consultation.count({ where: { cancelledAt: { gte: from, lte: to } } }),
      this.prisma.user.groupBy({ by: ['role'], where: createdIn, _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['status'], where: createdIn, _count: { _all: true } }),
      this.prisma.payment.groupBy({
        by: ['currency'],
        where: {
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
          paidAt: { gte: from, lte: to },
        },
        _sum: { amountMinor: true },
      }),
      this.prisma.availabilitySlot.groupBy({
        by: ['status'],
        where: { startsAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(Object.values(ConsultationStatus).map((s) => [s, 0])) as Record<
      ConsultationStatus,
      number
    >;
    for (const row of byStatus) statusCounts[row.status] = row._count._all;
    const totalBookings = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    const slotCounts = Object.fromEntries(Object.values(SlotStatus).map((s) => [s, 0])) as Record<
      SlotStatus,
      number
    >;
    for (const row of slots) slotCounts[row.status] = row._count._all;
    const totalSlots = Object.values(slotCounts).reduce((a, b) => a + b, 0);

    return {
      range: { from, to },
      bookings: { total: totalBookings, byStatus: statusCounts, cancellations },
      slots: {
        total: totalSlots,
        byStatus: slotCounts,
        utilization: totalSlots ? Number((slotCounts.BOOKED / totalSlots).toFixed(4)) : 0,
      },
      newUsers: Object.fromEntries(usersByRole.map((r) => [r.role, r._count._all])),
      payments: {
        byStatus: Object.fromEntries(paymentsByStatus.map((r) => [r.status, r._count._all])),
        grossRevenueMinorByCurrency: Object.fromEntries(
          revenue.map((r) => [r.currency, r._sum.amountMinor ?? 0]),
        ),
      },
    };
  }

  async doctorUtilization(query: DoctorUtilizationQueryDto) {
    const { from, to } = this.range(query);
    const [doctors, total] = await this.prisma.$transaction([
      this.prisma.doctor.findMany({
        select: {
          id: true,
          specialization: true,
          user: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.doctor.count(),
    ]);
    const doctorIds = doctors.map((d) => d.id);

    const [slotRows, consultationRows] = await Promise.all([
      this.prisma.availabilitySlot.groupBy({
        by: ['doctorId', 'status'],
        where: { doctorId: { in: doctorIds }, startsAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
      this.prisma.consultation.groupBy({
        by: ['doctorId', 'status'],
        where: { doctorId: { in: doctorIds }, scheduledStartsAt: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

    const items = doctors.map((d) => {
      const slots = slotRows.filter((r) => r.doctorId === d.id);
      const totalSlots = slots.reduce((a, r) => a + r._count._all, 0);
      const booked = slots
        .filter((r) => r.status === SlotStatus.BOOKED)
        .reduce((a, r) => a + r._count._all, 0);
      const cons = consultationRows.filter((r) => r.doctorId === d.id);
      const count = (s: ConsultationStatus) => cons.find((r) => r.status === s)?._count._all ?? 0;
      return {
        doctorId: d.id,
        name: `${d.user.profile?.firstName ?? ''} ${d.user.profile?.lastName ?? ''}`.trim(),
        specialization: d.specialization,
        totalSlots,
        bookedSlots: booked,
        utilization: totalSlots ? Number((booked / totalSlots).toFixed(4)) : 0,
        consultations: {
          scheduled: count(ConsultationStatus.SCHEDULED),
          completed: count(ConsultationStatus.COMPLETED),
          cancelled: count(ConsultationStatus.CANCELLED),
          noShow: count(ConsultationStatus.NO_SHOW),
        },
      };
    });
    return { range: { from, to }, ...paginate(items, total, query) };
  }

  private range(query: { from?: string; to?: string }) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : addDays(to, -30);
    if (from >= to) throw new BadRequestException('from must be before to');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000)
      throw new BadRequestException(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
    return { from, to };
  }
}
