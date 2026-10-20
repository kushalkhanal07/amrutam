import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { CreateSlotsDto, GenerateSlotsDto, SlotRangeQueryDto } from './dto/availability.dto';
import { NotFoundException } from '@nestjs/common';

@ApiTags('availability')
@ApiBearerAuth()
@Controller('availability')
@Roles(Role.DOCTOR)
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Own slots (all statuses) in a range' })
  async listMine(@CurrentUser() user: AuthUser, @Query() query: SlotRangeQueryDto) {
    return this.availability.listMine(await this.doctorId(user), query);
  }

  @Post()
  @ApiOperation({ summary: 'Create explicit slots' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateSlotsDto) {
    return this.availability.createSlots(await this.doctorId(user), dto);
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate equal-length slots across a time range' })
  async generate(@CurrentUser() user: AuthUser, @Body() dto: GenerateSlotsDto) {
    return this.availability.generateSlots(await this.doctorId(user), dto);
  }

  @Post(':id/block')
  @ApiOperation({ summary: 'Block an available slot' })
  async block(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.availability.blockSlot(await this.doctorId(user), id, true);
  }

  @Post(':id/unblock')
  @ApiOperation({ summary: 'Unblock a blocked slot' })
  async unblock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.availability.blockSlot(await this.doctorId(user), id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an unbooked slot' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.availability.deleteSlot(await this.doctorId(user), id);
  }

  private async doctorId(user: AuthUser): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!doctor) {
      throw new NotFoundException('Doctor profile not found. Create it with POST /doctors/me');
    }
    return doctor.id;
  }
}
