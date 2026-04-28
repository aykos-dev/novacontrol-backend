import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  wb_token!: string;

  @IsString()
  @IsOptional()
  currency?: string = 'RUB';

  @IsNumber()
  @IsOptional()
  balance_alert_threshold?: number;
}
