import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreatePaymentIntentDto {
  @ApiProperty() @IsUUID() consultationId: string;
}

export class MockConfirmDto {
  @ApiPropertyOptional({ enum: ['succeeded', 'failed'], default: 'succeeded' })
  @IsOptional()
  @IsIn(['succeeded', 'failed'])
  outcome: 'succeeded' | 'failed' = 'succeeded';
}
