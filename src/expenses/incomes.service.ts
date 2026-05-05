import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtraIncome } from './extra-income.entity.js';
import { CreateIncomeDto } from './dto/create-income.dto.js';
import { UpdateIncomeDto } from './dto/update-income.dto.js';
import { roundKgsAmountUsdTimesRate } from './fx.utils.js';
import { AlertsService } from '../alerts/alerts.service.js';

/** Same semantics as expenses: KGS equivalent for WB rows. */
const INCOME_KGS_SUM_SQL =
  'COALESCE(income.amount_kgs, CAST(income.amount AS DECIMAL))';

@Injectable()
export class IncomesService {
  private readonly logger = new Logger(IncomesService.name);

  constructor(
    @InjectRepository(ExtraIncome)
    private readonly incomeRepo: Repository<ExtraIncome>,
    private readonly alertsService: AlertsService,
  ) {}

  async findAll(filters: {
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: ExtraIncome[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.incomeRepo
      .createQueryBuilder('income')
      .leftJoinAndSelect('income.client', 'client')
      .leftJoinAndSelect('income.creator', 'creator');

    if (filters.clientId) {
      qb.andWhere('income.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }

    if (filters.dateFrom) {
      qb.andWhere('income.income_date >= :dateFrom', {
        dateFrom: filters.dateFrom,
      });
    }

    if (filters.dateTo) {
      qb.andWhere('income.income_date <= :dateTo', {
        dateTo: filters.dateTo,
      });
    }

    qb.orderBy('income.income_date', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async create(dto: CreateIncomeDto, userId: string): Promise<ExtraIncome> {
    const amountKgs = roundKgsAmountUsdTimesRate(
      dto.amount,
      dto.exchange_rate_kgs_per_usd,
    );

    const row = this.incomeRepo.create({
      client_id: dto.client_id,
      income_date: dto.income_date,
      amount: String(dto.amount),
      exchange_rate_kgs_per_usd: String(dto.exchange_rate_kgs_per_usd),
      amount_kgs: amountKgs,
      currency: dto.currency ?? 'USD',
      note: dto.note ?? null,
      created_by: userId,
    });

    const saved = await this.incomeRepo.save(row);

    const full = await this.incomeRepo.findOne({
      where: { id: saved.id },
      relations: ['client', 'creator'],
    });

    try {
      await this.alertsService.checkLowBalanceForClient(dto.client_id);
    } catch (err) {
      this.logger.warn(
        `Low-balance check after income failed for client ${dto.client_id}`,
        err instanceof Error ? err.stack : err,
      );
    }

    return full ?? saved;
  }

  async update(id: string, dto: UpdateIncomeDto): Promise<ExtraIncome> {
    const income = await this.incomeRepo.findOne({ where: { id } });

    if (!income) {
      throw new NotFoundException(`Income with id "${id}" not found`);
    }

    if (dto.client_id !== undefined) income.client_id = dto.client_id;
    if (dto.income_date !== undefined) income.income_date = dto.income_date;
    if (dto.currency !== undefined) income.currency = dto.currency;
    if (dto.note !== undefined) income.note = dto.note;

    const mergedAmt =
      dto.amount !== undefined ? dto.amount : Number(income.amount);
    const mergedRateRaw =
      dto.exchange_rate_kgs_per_usd !== undefined
        ? dto.exchange_rate_kgs_per_usd
        : income.exchange_rate_kgs_per_usd != null
          ? Number(income.exchange_rate_kgs_per_usd)
          : undefined;

    if (
      dto.amount !== undefined ||
      dto.exchange_rate_kgs_per_usd !== undefined
    ) {
      if (mergedRateRaw != null && mergedRateRaw > 0) {
        income.amount = String(mergedAmt);
        income.exchange_rate_kgs_per_usd = String(mergedRateRaw);
        income.amount_kgs = roundKgsAmountUsdTimesRate(
          mergedAmt,
          mergedRateRaw,
        );
      }
    }

    await this.incomeRepo.save(income);
    const reloaded = await this.incomeRepo.findOne({
      where: { id: income.id },
      relations: ['client', 'creator'],
    });
    return reloaded ?? income;
  }

  async remove(id: string): Promise<void> {
    const income = await this.incomeRepo.findOne({ where: { id } });

    if (!income) {
      throw new NotFoundException(`Income with id "${id}" not found`);
    }

    await this.incomeRepo.softRemove(income);
  }

  /** Totals in KGS for mixing with WB figures (legacy rows: amount treated as KGS when rate absent). */
  async getSummary(
    clientId?: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ grandTotal: number; grandTotalKgs: number }> {
    const qb = this.incomeRepo
      .createQueryBuilder('income')
      .select(`SUM(${INCOME_KGS_SUM_SQL})`, 'total');

    if (clientId) {
      qb.andWhere('income.client_id = :clientId', { clientId });
    }

    if (dateFrom) {
      qb.andWhere('income.income_date >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      qb.andWhere('income.income_date <= :dateTo', { dateTo });
    }

    const row: { total: string | null } | undefined = await qb.getRawOne();
    const grandTotal = Math.round(Number(row?.total ?? 0) * 100) / 100;

    return { grandTotal, grandTotalKgs: grandTotal };
  }

  async getDailyTotals(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<{ date: string; total: number }[]> {
    const qb = this.incomeRepo
      .createQueryBuilder('income')
      .select('income.income_date', 'date')
      .addSelect(`SUM(${INCOME_KGS_SUM_SQL})`, 'total')
      .where('income.client_id = :clientId', { clientId })
      .groupBy('income.income_date')
      .orderBy('income.income_date', 'ASC');

    if (dateFrom) {
      qb.andWhere('income.income_date >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('income.income_date <= :dateTo', { dateTo });
    }

    const rows: { date: string; total: string }[] = await qb.getRawMany();
    return rows.map((r) => ({
      date: String(r.date),
      total: Math.round(Number(r.total) * 100) / 100,
    }));
  }

  async findEntriesByClientForDate(
    clientId: string,
    date: string,
  ): Promise<
    Array<{
      amount: number;
      currency: string;
      amountKgs: number;
    }>
  > {
    const rows = await this.incomeRepo.find({
      where: { client_id: clientId, income_date: date },
      order: { created_at: 'ASC' },
    });

    return rows.map((row) => ({
      amount: Number(row.amount),
      currency: row.currency,
      amountKgs: Number(row.amount_kgs ?? row.amount),
    }));
  }

  async sumExtraIncomesOriginalAmount(filters: {
    incomeDate?: string;
    clientId?: string;
    clientIds?: string[];
  }): Promise<number> {
    const qb = this.incomeRepo
      .createQueryBuilder('income')
      .select('COALESCE(SUM(CAST(income.amount AS DECIMAL)), 0)', 'total');

    if (filters.incomeDate) {
      qb.andWhere('income.income_date = :incomeDate', {
        incomeDate: filters.incomeDate,
      });
    }
    if (filters.clientId) {
      qb.andWhere('income.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }
    if (filters.clientIds?.length) {
      qb.andWhere('income.client_id IN (:...clientIds)', {
        clientIds: filters.clientIds,
      });
    }

    const row = await qb.getRawOne<{ total: string | null }>();
    return Math.round(Number(row?.total ?? 0) * 100) / 100;
  }
}
