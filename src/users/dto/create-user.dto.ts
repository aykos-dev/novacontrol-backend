import { IsString, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
import { AdminRole } from '../admin-user.entity.js';
import { AppSection } from '../app-section.js';

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

  @IsOptional()
  @IsArray()
  @IsEnum(AppSection, { each: true })
  allowed_sections?: AppSection[];
}
