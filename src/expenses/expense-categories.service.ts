import {
  Injectable,
  OnModuleInit,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseCategory } from './expense-category.entity.js';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';
import { DEFAULT_EXPENSE_CATEGORY_SEED } from './expense-category-defaults.js';

@Injectable()
export class ExpenseCategoriesService implements OnModuleInit {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultsIfEmpty();
  }

  private async seedDefaultsIfEmpty(): Promise<void> {
    const n = await this.categoryRepo.count();
    if (n > 0) return;
    await this.categoryRepo.save(
      DEFAULT_EXPENSE_CATEGORY_SEED.map((row) =>
        this.categoryRepo.create({
          ...row,
          is_active: true,
        }),
      ),
    );
  }

  async findAllActive(): Promise<ExpenseCategory[]> {
    return this.categoryRepo.find({
      where: { is_active: true },
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  async findAll(): Promise<ExpenseCategory[]> {
    return this.categoryRepo.find({
      withDeleted: true,
      relations: ['creator'],
      order: { sort_order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ExpenseCategory> {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Expense category "${id}" not found`);
    }
    return row;
  }

  async create(
    dto: CreateExpenseCategoryDto,
    userId: string,
  ): Promise<ExpenseCategory> {
    const existing = await this.categoryRepo.findOne({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(`Category slug "${dto.slug}" already exists`);
    }
    const row = this.categoryRepo.create({
      slug: dto.slug,
      name: dto.name,
      color: dto.color ?? null,
      icon_emoji: dto.icon_emoji ?? null,
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
      created_by: userId,
    });
    const saved = await this.categoryRepo.save(row);
    return (
      (await this.categoryRepo.findOne({
        where: { id: saved.id },
        relations: ['creator'],
      })) ?? saved
    );
  }

  async update(id: string, dto: UpdateExpenseCategoryDto): Promise<ExpenseCategory> {
    const row = await this.findOne(id);
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.color !== undefined) {
      row.color = dto.color && dto.color.length > 0 ? dto.color : null;
    }
    if (dto.icon_emoji !== undefined) {
      row.icon_emoji =
        dto.icon_emoji && dto.icon_emoji.length > 0 ? dto.icon_emoji : null;
    }
    if (dto.sort_order !== undefined) row.sort_order = dto.sort_order;
    if (dto.is_active !== undefined) row.is_active = dto.is_active;
    return this.categoryRepo.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.findOne(id);
    row.is_active = false;
    await this.categoryRepo.save(row);
    await this.categoryRepo.softDelete({ id: row.id });
  }

  async assertActiveCategoryId(id: string): Promise<ExpenseCategory> {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row || !row.is_active) {
      throw new NotFoundException(`Active expense category "${id}" not found`);
    }
    return row;
  }
}
