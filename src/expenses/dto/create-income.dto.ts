import {
  IsUUID,
  IsDateString,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';

/** Amount is always USD; rate converts to KGS for mixing with WB figures. */
export class CreateIncomeDto {
  @IsUUID()
  client_id!: string;

  @IsDateString()
  income_date!: string;

  /** Amount in USD. */
  @IsNumber()
  @Min(0.01)
  amount!: number;

  /** KGS per 1 USD at transaction time. */
  @IsNumber()
  @Min(0.000001)
  exchange_rate_kgs_per_usd!: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsString()
  @IsOptional()
  note?: string;
}
