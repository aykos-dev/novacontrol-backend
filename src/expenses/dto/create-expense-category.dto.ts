import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message:
      'slug must start with a letter and contain only lowercase letters, digits, underscores',
  })
  slug!: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
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
