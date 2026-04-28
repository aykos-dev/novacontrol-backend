import {
  IsUUID,
  IsDateString,
  IsNumber,
  IsString,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateExpenseDto {
  @IsUUID()
  client_id!: string;

  @IsDateString()
  expense_date!: string;

  @IsUUID()
  category_id!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  @IsOptional()
  currency?: string = 'USD';

  @IsString()
  @IsOptional()
  note?: string;
}
