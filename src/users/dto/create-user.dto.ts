import { IsString, IsOptional, IsEnum, IsNumber } from 'class-validator';
import { AdminRole } from '../admin-user.entity.js';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsString()
  username!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsNumber()
  telegram_id?: number;
}
