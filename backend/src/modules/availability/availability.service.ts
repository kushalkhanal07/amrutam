import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SlotStatus } from '@prisma/client';
import { addDays, addMinutes } from '../../common/utils/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSlotsDto, GenerateSlotsDto, SlotRangeQueryDto } from './dto/availability.dto';

const MAX_RANGE_DAYS = 31;
const MAX_GENERATED_SLOTS = 500;

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public listing: only AVAILABLE slots in a bounded window. */
  async listAvailableForDoctor(doctorId: string, query: SlotRangeQueryDto) {
    const { from, to } = this.resolveRange(query);
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId, status: SlotStatus.AVAILABLE, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true, status: true },
      take: 1000,
    });
  }

  /** Doctor's own view, includes booked and blocked slots. */
  async listMine(doctorId: string, query: SlotRangeQueryDto) {
    const { from, to } = this.resolveRange(query);
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
      take: 1000,
    });
  }

  async createSlots(doctorId: string, dto: CreateSlotsDto) {
    const rows = dto.slots.map((s) => this.toRow(doctorId, new Date(s.startsAt), new Date(s.endsAt)));
    this.assertNoOverlap(rows);
    await this.assertNoDbOverlap(doctorId, rows);
    try {
      await this.prisma.availabilitySlot.createMany({ data: rows });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('A slot already exists at one of these start times');
      }
      throw err;
    }
    return this.prisma.availabilitySlot.findMany({
      where: { doctorId, startsAt: { in: rows.map((r) => r.startsAt) } },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Convenience: split a time range into equal slots. */
  async generateSlots(doctorId: string, dto: GenerateSlotsDto) {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to <= from) {
      throw new BadRequestException('to must be after from');
    }
    const slots: { startsAt: string; endsAt: string }[] = [];
    for (
      let cursor = from;
      addMinutes(cursor, dto.durationMinutes) <= to;
      cursor = addMinutes(cursor, dto.durationMinutes)
    ) {
      slots.push({
        startsAt: cursor.toISOString(),
        endsAt: addMinutes(cursor, dto.durationMinutes).toISOString(),
      });
      if (slots.length > MAX_GENERATED_SLOTS) {
        throw new BadRequestException(`Range would generate more than ${MAX_GENERATED_SLOTS} slots`);
      }
    }
    if (slots.length === 0) {
      throw new BadRequestException('Range is shorter than one slot');
    }
    return this.createSlots(doctorId, { slots });
  }

  async deleteSlot(doctorId: string, slotId: string) {
    const slot = await this.prisma.availabilitySlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    if (slot.doctorId !== doctorId) {
      throw new ForbiddenException('You can only delete your own slots');
    }
    // Conditional delete: a slot booked between the read and the delete is preserved.
    const result = await this.prisma.availabilitySlot.deleteMany({
      where: { id: slotId, status: { not: SlotStatus.BOOKED } },
    });
    if (result.count === 0) {
      throw new ConflictException('Booked slots cannot be deleted; cancel the booking instead');
    }
  }

  async blockSlot(doctorId: string, slotId: string, block: boolean) {
    const target = block ? SlotStatus.BLOCKED : SlotStatus.AVAILABLE;
    const source = block ? SlotStatus.AVAILABLE : SlotStatus.BLOCKED;
    const result = await this.prisma.availabilitySlot.updateMany({
      where: { id: slotId, doctorId, status: source },
      data: { status: target },
    });
    if (result.count === 0) {
      throw new ConflictException(`Slot is not ${source.toLowerCase()} or does not belong to you`);
    }
    return this.prisma.availabilitySlot.findUniqueOrThrow({ where: { id: slotId } });
  }

  // ---- helpers --------------------------------------------------------------

  private toRow(doctorId: string, startsAt: Date, endsAt: Date) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException('Invalid slot time');
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException('Slot must end after it starts');
    }
    if (startsAt < new Date()) {
      throw new BadRequestException('Slots must be in the future');
    }
    if (endsAt.getTime() - startsAt.getTime() > 4 * 60 * 60 * 1000) {
      throw new BadRequestException('A slot cannot be longer than 4 hours');
    }
    return { doctorId, startsAt, endsAt };
  }

  private assertNoOverlap(rows: { startsAt: Date; endsAt: Date }[]) {
    const sorted = [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startsAt < sorted[i - 1].endsAt) {
        throw new BadRequestException('Slots in the request overlap each other');
      }
    }
  }

  private async assertNoDbOverlap(doctorId: string, rows: { startsAt: Date; endsAt: Date }[]) {
    const min = new Date(Math.min(...rows.map((r) => r.startsAt.getTime())));
    const max = new Date(Math.max(...rows.map((r) => r.endsAt.getTime())));
    const existing = await this.prisma.availabilitySlot.findMany({
      where: { doctorId, startsAt: { lt: max }, endsAt: { gt: min } },
      select: { startsAt: true, endsAt: true },
    });
    for (const row of rows) {
      if (existing.some((e) => row.startsAt < e.endsAt && row.endsAt > e.startsAt)) {
        throw new ConflictException(`Slot starting ${row.startsAt.toISOString()} overlaps an existing slot`);
      }
    }
  }

  private resolveRange(query: SlotRangeQueryDto) {
    const from = query.from ? new Date(query.from) : new Date();
    const to = query.to ? new Date(query.to) : addDays(from, 14);
    if (to <= from) {
      throw new BadRequestException('to must be after from');
    }
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new BadRequestException(`Range cannot exceed ${MAX_RANGE_DAYS} days`);
    }
    return { from, to };
  }
}
