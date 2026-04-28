import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtraExpense } from './extra-expense.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { AlertsService } from '../alerts/alerts.service.js';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(ExtraExpense)
    private readonly expenseRepo: Repository<ExtraExpense>,
    private readonly telegramService: TelegramService,
    private readonly expenseCategoriesService: ExpenseCategoriesService,
    private readonly alertsService: AlertsService,
  ) {}

  async findAll(filters: {
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: ExtraExpense[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.client', 'client')
      .leftJoinAndSelect('expense.creator', 'creator')
      .leftJoinAndSelect('expense.expenseCategory', 'expenseCategory');

    if (filters.clientId) {
      qb.andWhere('expense.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('expense.expense_date >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      qb.andWhere('expense.expense_date <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    if (filters.categoryId) {
      qb.andWhere('expense.category_id = :categoryId', {
        categoryId: filters.categoryId,
      });
    }

    qb.orderBy('expense.expense_date', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async create(dto: CreateExpenseDto, userId: string): Promise<ExtraExpense> {
    await this.expenseCategoriesService.assertActiveCategoryId(dto.category_id);

    const expense = this.expenseRepo.create({
      client_id: dto.client_id,
      expense_date: dto.expense_date,
      category_id: dto.category_id,
      amount: String(dto.amount),
      currency: dto.currency ?? 'USD',
      note: dto.note ?? null,
      created_by: userId,
    });

    const saved = await this.expenseRepo.save(expense);

    const full = await this.expenseRepo.findOne({
      where: { id: saved.id },
      relations: ['client', 'creator', 'expenseCategory'],
    });

    if (full?.expenseCategory) {
      const icon = full.expenseCategory.icon_emoji ?? '📌';
      await this.telegramService.sendExpenseCreatedAlert({
        date: full.expense_date,
        username: full.creator?.username ?? 'unknown',
        categoryLabel: `${icon} ${full.expenseCategory.name}`.trim(),
        amount: Number(full.amount),
        currency: full.currency,
        note: full.note,
      });
    }

    try {
      await this.alertsService.checkLowBalanceForClient(dto.client_id);
    } catch (err) {
      this.logger.warn(
        `Low-balance check after expense failed for client ${dto.client_id}`,
        err instanceof Error ? err.stack : err,
      );
    }

    return full ?? saved;
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<ExtraExpense> {
    const expense = await this.expenseRepo.findOne({ where: { id } });

    if (!expense) {
      throw new NotFoundException(`Expense with id "${id}" not found`);
    }

    if (dto.category_id !== undefined) {
      await this.expenseCategoriesService.assertActiveCategoryId(dto.category_id);
      expense.category_id = dto.category_id;
    }
    if (dto.client_id !== undefined) expense.client_id = dto.client_id;
    if (dto.expense_date !== undefined) expense.expense_date = dto.expense_date;
    if (dto.amount !== undefined) expense.amount = String(dto.amount);
    if (dto.currency !== undefined) expense.currency = dto.currency;
    if (dto.note !== undefined) expense.note = dto.note;

    await this.expenseRepo.save(expense);
    const reloaded = await this.expenseRepo.findOne({
      where: { id: expense.id },
      relations: ['client', 'creator', 'expenseCategory'],
    });
    return reloaded ?? expense;
  }

  async remove(id: string): Promise<void> {
    const expense = await this.expenseRepo.findOne({ where: { id } });

    if (!expense) {
      throw new NotFoundException(`Expense with id "${id}" not found`);
    }

    await this.expenseRepo.softRemove(expense);
  }

  async getSummary(
    clientId?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{
    byCategory: {
      category_id: string;
      slug: string;
      name: string;
      color: string | null;
      icon_emoji: string | null;
      total: number;
      currency: string;
    }[];
    grandTotal: number;
  }> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .innerJoin('expense.expenseCategory', 'cat')
      .select('cat.id', 'category_id')
      .addSelect('cat.slug', 'slug')
      .addSelect('cat.name', 'name')
      .addSelect('cat.color', 'color')
      .addSelect('cat.icon_emoji', 'icon_emoji')
      .addSelect('expense.currency', 'currency')
      .addSelect('SUM(expense.amount)', 'total')
      .groupBy('cat.id')
      .addGroupBy('cat.slug')
      .addGroupBy('cat.name')
      .addGroupBy('cat.color')
      .addGroupBy('cat.icon_emoji')
      .addGroupBy('expense.currency');

    if (clientId) {
      qb.andWhere('expense.client_id = :clientId', { clientId });
    }

    if (dateFrom) {
      qb.andWhere('expense.expense_date >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      qb.andWhere('expense.expense_date <= :dateTo', { dateTo });
    }

    const rows: {
      category_id: string;
      slug: string;
      name: string;
      color: string | null;
      icon_emoji: string | null;
      total: string;
      currency: string;
    }[] = await qb.getRawMany();

    const byCategory = rows.map((r) => ({
      category_id: r.category_id,
      slug: r.slug,
      name: r.name,
      color: r.color,
      icon_emoji: r.icon_emoji,
      total: Number(r.total),
      currency: r.currency,
    }));

    const grandTotal = byCategory.reduce((sum, r) => sum + r.total, 0);

    return { byCategory, grandTotal };
  }

  async getDailyTotals(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ date: string; total: number }[]> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .select('expense.expense_date', 'date')
      .addSelect('SUM(expense.amount)', 'total')
      .where('expense.client_id = :clientId', { clientId })
      .groupBy('expense.expense_date')
      .orderBy('expense.expense_date', 'ASC');

    if (dateFrom) {
      qb.andWhere('expense.expense_date >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('expense.expense_date <= :dateTo', { dateTo });
    }

    const rows: { date: string; total: string }[] = await qb.getRawMany();
    return rows.map((r) => ({
      date: String(r.date),
      total: Math.round(Number(r.total) * 100) / 100,
    }));
  }
}
