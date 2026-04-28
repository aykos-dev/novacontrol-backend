import { IsUUID, IsNumber, IsOptional } from 'class-validator';

export class UpdateAlertConfigDto {
  @IsUUID()
  clientId!: string;

  @IsNumber()
  @IsOptional()
  threshold!: number | null;
}
