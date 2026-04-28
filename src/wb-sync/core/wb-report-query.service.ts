import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WbReportRow } from '../wb-report-row.entity.js';
import type { WbReportResult } from './wb-sync.types.js';

@Injectable()
export class WbReportQueryService {
  constructor(
    @InjectRepository(WbReportRow)
    private readonly reportRowRepo: Repository<WbReportRow>,
  ) {}

  async getReport(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<WbReportResult> {
    const qb = this.reportRowRepo
      .createQueryBuilder('r')
      .select([
        'r.rr_dt',
        'r.ppvz_for_pay',
        'r.retail_price_withdisc_rub',
        'r.delivery_rub',
        'r.storage_fee',
        'r.penalty',
        'r.deduction',
        'r.acceptance',
        'r.rebill_logistic_cost',
        'r.raw_data',
      ])
      .where('r.client_id = :clientId', { clientId });

    if (dateFrom) {
      qb.andWhere('r.rr_dt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('r.rr_dt <= :dateTo', { dateTo });
    }

    qb.orderBy('r.rr_dt', 'ASC');

    const rows = await qb.getMany();

    const dailyMap = new Map<
      string,
      { income: number; expenses: number }
    >();

    let totalIncome = 0;
    let totalExpenses = 0;
    let totalRetailSales = 0;
    const breakdown = {
      retail_sales: 0,
      ppvz_reward: 0,
      delivery_rub: 0,
      storage_fee: 0,
      penalty: 0,
      deduction: 0,
      acceptance: 0,
      rebill_logistic_cost: 0,
    };

    for (const row of rows) {
      const date = String(row.rr_dt);
      const retailSales =
        parseFloat(row.retail_price_withdisc_rub) || 0;
      // «Приход» / income = продажи (retail with discount), not ppvz_for_pay
      const income = retailSales;

      const ppvz_for_pay = parseFloat(row.ppvz_for_pay) || 0;
      const raw = row.raw_data as Record<string, unknown> | null;
      const acquiring_fee =
        raw ? parseFloat(String(raw.acquiringFee)) || 0 : 0;

      // WB commission = full deduction from sales (commission + VAT), excluding acquiring fee.
      // For non-sale rows (logistics/storage) retail and forPay are 0, so this is 0.
      const ppvz_reward = retailSales - ppvz_for_pay - acquiring_fee;

      const delivery_rub = parseFloat(row.delivery_rub) || 0;
      const storage_fee = parseFloat(row.storage_fee) || 0;
      const penalty = parseFloat(row.penalty) || 0;
      const deduction = parseFloat(row.deduction) || 0;
      const acceptance = parseFloat(row.acceptance) || 0;
      const rebill_logistic_cost =
        parseFloat(row.rebill_logistic_cost) || 0;

      const rowExpenses =
        ppvz_reward +
        delivery_rub +
        storage_fee +
        penalty +
        deduction +
        acceptance +
        rebill_logistic_cost;

      const entry = dailyMap.get(date) ?? { income: 0, expenses: 0 };
      entry.income += income;
      entry.expenses += rowExpenses;
      dailyMap.set(date, entry);

      totalIncome += income;
      totalExpenses += rowExpenses;
      totalRetailSales += retailSales;

      breakdown.retail_sales += retailSales;
      breakdown.ppvz_reward += ppvz_reward;
      breakdown.delivery_rub += delivery_rub;
      breakdown.storage_fee += storage_fee;
      breakdown.penalty += penalty;
      breakdown.deduction += deduction;
      breakdown.acceptance += acceptance;
      breakdown.rebill_logistic_cost += rebill_logistic_cost;
    }

    const daily = Array.from(dailyMap.entries()).map(([date, vals]) => ({
      date,
      income: Math.round(vals.income * 100) / 100,
      expenses: Math.round(vals.expenses * 100) / 100,
    }));

    return {
      daily,
      totals: {
        income: Math.round(totalIncome * 100) / 100,
        expenses: Math.round(totalExpenses * 100) / 100,
        retail_sales: Math.round(totalRetailSales * 100) / 100,
      },
      breakdown: {
        retail_sales: Math.round(breakdown.retail_sales * 100) / 100,
        ppvz_reward: Math.round(breakdown.ppvz_reward * 100) / 100,
        delivery_rub: Math.round(breakdown.delivery_rub * 100) / 100,
        storage_fee: Math.round(breakdown.storage_fee * 100) / 100,
        penalty: Math.round(breakdown.penalty * 100) / 100,
        deduction: Math.round(breakdown.deduction * 100) / 100,
        acceptance: Math.round(breakdown.acceptance * 100) / 100,
        rebill_logistic_cost:
          Math.round(breakdown.rebill_logistic_cost * 100) / 100,
      },
    };
  }
}
