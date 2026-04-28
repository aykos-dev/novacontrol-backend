import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  Matches,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class UpdateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Empty string clears the color. */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'color must be a #RRGGBB hex value',
  })
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon_emoji?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
