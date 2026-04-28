import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WbSyncService } from './wb-sync.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { ExtraExpense } from '../expenses/extra-expense.entity.js';
import { Client } from '../clients/client.entity.js';
import type { SchedulerJobId } from './scheduler-jobs.js';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly wbSyncService: WbSyncService,
    private readonly alertsService: AlertsService,
    private readonly telegramService: TelegramService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    @InjectRepository(ExtraExpense)
    private readonly expenseRepo: Repository<ExtraExpense>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  onModuleInit(): void {
    const syncCron = this.configService.get<string>(
      'SYNC_CRON_SCHEDULE',
      '*/5 * * * *',
    );
    const dailyReportCron = this.configService.get<string>(
      'DAILY_REPORT_TIME',
      '0 22 * * *',
    );
    const morningReportCron = this.configService.get<string>(
      'MORNING_REPORT_TIME',
      '0 9 * * *',
    );

    this.addCron('full-sync', syncCron, () => this.handleFullSync());
    this.addCron('daily-expense-report', dailyReportCron, () =>
      this.handleDailyExpenseReport(),
    );
    this.addCron('morning-balance-report', morningReportCron, () =>
      this.handleMorningBalanceReport(),
    );
    this.addCron('alert-reset', '0 0 * * *', () =>
      this.handleAlertReset(),
    );
  }

  private addCron(name: string, expression: string, cb: () => Promise<void>): void {
    const job = new CronJob(expression, async () => {
      try {
        await cb();
      } catch (err: any) {
        this.logger.error(`[CRON:${name}] ${err?.message}`);
      }
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Registered cron "${name}" with schedule: ${expression}`);
  }

  /** Manual trigger from API (same logic as cron handlers). */
  async runManualJob(jobId: SchedulerJobId): Promise<void> {
    switch (jobId) {
      case 'full-sync':
        return this.handleFullSync();
      case 'daily-expense-report':
        return this.handleDailyExpenseReport();
      case 'morning-balance-report':
        return this.handleMorningBalanceReport();
      case 'alert-reset':
        return this.handleAlertReset();
    }
  }

  async handleFullSync(): Promise<void> {
    this.logger.log('[CRON] Starting full WB sync for all clients');
    await this.wbSyncService.syncAllClients();
  }

  async handleDailyExpenseReport(): Promise<void> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);

    this.logger.log(
      `[daily-expense-report] start — reportDate=${dateStr} (UTC calendar day from server clock; expenses must match this date column)`,
    );

    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    this.logger.log(
      `[daily-expense-report] activeClients=${clients.length}`,
    );

    const clientReports: Array<{
      clientName: string;
      expenses: Array<{
        categoryLabel: string;
        amount: number;
        currency: string;
      }>;
      total: number;
      currency: string;
    }> = [];

    let grandTotal = 0;
    const clientsSkippedNoExpenses: string[] = [];

    for (const client of clients) {
      const expenses = await this.expenseRepo
        .createQueryBuilder('e')
        .innerJoin('e.expenseCategory', 'cat')
        .select('cat.name', 'name')
        .addSelect('cat.icon_emoji', 'icon_emoji')
        .addSelect(
          'SUM(COALESCE(e.amount_kgs, CAST(e.amount AS DECIMAL)))',
          'total',
        )
        .where('e.client_id = :clientId', { clientId: client.id })
        .andWhere('e.expense_date = :date', { date: dateStr })
        .groupBy('cat.id')
        .addGroupBy('cat.name')
        .addGroupBy('cat.icon_emoji')
        .getRawMany<{
          name: string;
          icon_emoji: string | null;
          total: string;
        }>();

      if (expenses.length === 0) {
        clientsSkippedNoExpenses.push(client.name);
        continue;
      }

      const expenseItems = expenses.map((e) => {
        const icon = e.icon_emoji ?? '📌';
        return {
          categoryLabel: `${icon} ${e.name}`.trim(),
          amount: Number(e.total),
          currency: 'KGS',
        };
      });

      const clientTotal = expenseItems.reduce((s, e) => s + e.amount, 0);
      grandTotal += clientTotal;

      clientReports.push({
        clientName: client.name,
        expenses: expenseItems,
        total: clientTotal,
        currency: expenseItems[0]?.currency ?? 'KGS',
      });
    }

    if (clientReports.length === 0) {
      this.logger.warn(
        `[daily-expense-report] Telegram not sent: no expenses for reportDate=${dateStr}. ` +
          `Active clients checked: ${clients.length}. ` +
          (clientsSkippedNoExpenses.length > 0
            ? `All had zero rows for this date (e.g. ${clientsSkippedNoExpenses.slice(0, 3).join(', ')}${clientsSkippedNoExpenses.length > 3 ? '…' : ''}). `
            : '') +
          `If you expected data, compare expense_date in DB to this UTC date or run after adding expenses for ${dateStr}.`,
      );
      return;
    }

    this.logger.log(
      `[daily-expense-report] sending Telegram: clientsInReport=${clientReports.length}, grandTotal=${grandTotal}`,
    );

    await this.telegramService.sendDailyExpenseReport({
      date: dateStr,
      clientReports,
      grandTotal,
      currency: 'KGS',
    });

    this.logger.log('[daily-expense-report] finished (Telegram path completed)');
  }

  async handleMorningBalanceReport(): Promise<void> {
    this.logger.log('[CRON] Sending morning balance report');
    await this.alertsService.sendBalanceReport();
  }

  async handleAlertReset(): Promise<void> {
    this.logger.log('[CRON] Midnight alert reset');
    await this.alertsService.resetDailyAlerts();
  }
}
