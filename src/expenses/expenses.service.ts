import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtraExpense } from './extra-expense.entity.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { UpdateExpenseDto } from './dto/update-expense.dto.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { roundKgsAmountUsdTimesRate } from './fx.utils.js';

/** Summaries mix with WB rows in KGS: prefer computed column; legacy rows store amount as KGS when rate was absent. */
export const EXPENSE_KGS_SUM_SQL =
  'COALESCE(expense.amount_kgs, CAST(expense.amount AS DECIMAL))';

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(ExtraExpense)
    private readonly expenseRepo: Repository<ExtraExpense>,
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

    const amountKgs = roundKgsAmountUsdTimesRate(
      dto.amount,
      dto.exchange_rate_kgs_per_usd,
    );

    const expense = this.expenseRepo.create({
      client_id: dto.client_id,
      expense_date: dto.expense_date,
      category_id: dto.category_id,
      amount: String(dto.amount),
      exchange_rate_kgs_per_usd: String(dto.exchange_rate_kgs_per_usd),
      amount_kgs: amountKgs,
      currency: dto.currency ?? 'USD',
      note: dto.note ?? null,
      created_by: userId,
    });

    const saved = await this.expenseRepo.save(expense);

    const full = await this.expenseRepo.findOne({
      where: { id: saved.id },
      relations: ['client', 'creator', 'expenseCategory'],
    });

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
    if (dto.currency !== undefined) expense.currency = dto.currency;
    if (dto.note !== undefined) expense.note = dto.note;

    const mergedAmt =
      dto.amount !== undefined ? dto.amount : Number(expense.amount);
    const mergedRateRaw =
      dto.exchange_rate_kgs_per_usd !== undefined
        ? dto.exchange_rate_kgs_per_usd
        : expense.exchange_rate_kgs_per_usd != null
          ? Number(expense.exchange_rate_kgs_per_usd)
          : undefined;

    if (
      dto.amount !== undefined ||
      dto.exchange_rate_kgs_per_usd !== undefined
    ) {
      if (mergedRateRaw != null && mergedRateRaw > 0) {
        expense.amount = String(mergedAmt);
        expense.exchange_rate_kgs_per_usd = String(mergedRateRaw);
        expense.amount_kgs = roundKgsAmountUsdTimesRate(
          mergedAmt,
          mergedRateRaw,
        );
      }
    }

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
    /** Sum of expense equivalents in KGS (WB mixing currency). */
    grandTotal: number;
    grandTotalKgs: number;
    /** Sum of original expense amounts, used for USD dashboard cards. */
    grandTotalOriginal: number;
  }> {
    const filters: { clientId?: string; dateFrom?: string; dateTo?: string } = {
      clientId,
      dateFrom,
      dateTo,
    };
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .innerJoin('expense.expenseCategory', 'cat')
      .select('cat.id', 'category_id')
      .addSelect('cat.slug', 'slug')
      .addSelect('cat.name', 'name')
      .addSelect('cat.color', 'color')
      .addSelect('cat.icon_emoji', 'icon_emoji')
      .addSelect(`SUM(${EXPENSE_KGS_SUM_SQL})`, 'total')
      .groupBy('cat.id')
      .addGroupBy('cat.slug')
      .addGroupBy('cat.name')
      .addGroupBy('cat.color')
      .addGroupBy('cat.icon_emoji');

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
    }[] = await qb.getRawMany();

    const byCategory = rows.map((r) => ({
      category_id: r.category_id,
      slug: r.slug,
      name: r.name,
      color: r.color,
      icon_emoji: r.icon_emoji,
      total: Number(r.total),
      currency: 'KGS',
    }));

    const grandTotal = byCategory.reduce((sum, r) => sum + r.total, 0);
    const grandTotalOriginal = await this.sumExtraExpensesOriginalAmount(filters);

    return { byCategory, grandTotal, grandTotalKgs: grandTotal, grandTotalOriginal };
  }

  /**
   * Net extra expenses (KGS) using same COALESCE(amount_kgs, amount) as summaries.
   */
  async sumExtraExpensesKgs(filters: {
    expenseDate?: string;
    dateFrom?: string;
    dateTo?: string;
    clientIds?: string[];
    createdByUserIds?: string[];
  }): Promise<number> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .select(`COALESCE(SUM(${EXPENSE_KGS_SUM_SQL}), 0)`, 'total');

    if (filters.expenseDate) {
      qb.andWhere('expense.expense_date = :expenseDate', {
        expenseDate: filters.expenseDate,
      });
    } else {
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
    }

    if (filters.clientIds?.length) {
      qb.andWhere('expense.client_id IN (:...clientIds)', {
        clientIds: filters.clientIds,
      });
    }

    if (filters.createdByUserIds?.length) {
      qb.andWhere('expense.created_by IN (:...uids)', {
        uids: filters.createdByUserIds,
      });
    }

    const row = await qb.getRawOne<{ total: string | null }>();
    const n = Number(row?.total ?? 0);
    return Math.round(n * 100) / 100;
  }

  async getDailyTotals(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ date: string; total: number }[]> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .select('expense.expense_date', 'date')
      .addSelect(`SUM(${EXPENSE_KGS_SUM_SQL})`, 'total')
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

  async getExpenseCategoryReportByClient(date: string): Promise<
    Array<{
      clientId: string;
      clientName: string;
      expenses: Array<{
        categoryName: string;
        iconEmoji: string | null;
        amount: number;
        currency: string;
      }>;
      total: number;
      currency: string;
    }>
  > {
    const rows = await this.expenseRepo
      .createQueryBuilder('expense')
      .innerJoin('expense.client', 'client')
      .innerJoin('expense.expenseCategory', 'cat')
      .select('client.id', 'clientId')
      .addSelect('client.name', 'clientName')
      .addSelect('cat.name', 'categoryName')
      .addSelect('cat.icon_emoji', 'iconEmoji')
      .addSelect('cat.sort_order', 'sortOrder')
      .addSelect('expense.currency', 'currency')
      .addSelect('SUM(CAST(expense.amount AS DECIMAL))', 'amount')
      .where('client.is_active = true')
      .andWhere('expense.expense_date = :date', { date })
      .groupBy('client.id')
      .addGroupBy('client.name')
      .addGroupBy('cat.id')
      .addGroupBy('cat.name')
      .addGroupBy('cat.icon_emoji')
      .addGroupBy('cat.sort_order')
      .addGroupBy('expense.currency')
      .orderBy('client.name', 'ASC')
      .addOrderBy('cat.sort_order', 'ASC')
      .getRawMany<{
        clientId: string;
        clientName: string;
        categoryName: string;
        iconEmoji: string | null;
        sortOrder: string;
        currency: string;
        amount: string;
      }>();

    const byClient = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        expenses: Array<{
          categoryName: string;
          iconEmoji: string | null;
          amount: number;
          currency: string;
        }>;
        total: number;
        currency: string;
      }
    >();

    for (const row of rows) {
      const amount = Math.round(Number(row.amount) * 100) / 100;
      const item = byClient.get(row.clientId) ?? {
        clientId: row.clientId,
        clientName: row.clientName,
        expenses: [],
        total: 0,
        currency: row.currency,
      };
      item.expenses.push({
        categoryName: row.categoryName,
        iconEmoji: row.iconEmoji,
        amount,
        currency: row.currency,
      });
      item.total = Math.round((item.total + amount) * 100) / 100;
      byClient.set(row.clientId, item);
    }

    return [...byClient.values()];
  }

  async sumExtraExpensesOriginalAmount(filters: {
    expenseDate?: string;
    dateFrom?: string;
    dateTo?: string;
    clientId?: string;
    clientIds?: string[];
  }): Promise<number> {
    const qb = this.expenseRepo
      .createQueryBuilder('expense')
      .select('COALESCE(SUM(CAST(expense.amount AS DECIMAL)), 0)', 'total');

    if (filters.expenseDate) {
      qb.andWhere('expense.expense_date = :expenseDate', {
        expenseDate: filters.expenseDate,
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
    if (filters.clientId) {
      qb.andWhere('expense.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }
    if (filters.clientIds?.length) {
      qb.andWhere('expense.client_id IN (:...clientIds)', {
        clientIds: filters.clientIds,
      });
    }

    const row = await qb.getRawOne<{ total: string | null }>();
    return Math.round(Number(row?.total ?? 0) * 100) / 100;
  }
}
