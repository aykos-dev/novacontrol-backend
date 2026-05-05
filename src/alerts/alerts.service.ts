import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { AlertLog, AlertType } from './alert-log.entity.js';
import { Client } from '../clients/client.entity.js';
import { ExtraExpense } from '../expenses/extra-expense.entity.js';
import { ExtraIncome } from '../expenses/extra-income.entity.js';
import { TelegramService } from '../telegram/telegram.service.js';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(AlertLog)
    private readonly alertLogRepo: Repository<AlertLog>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(ExtraExpense)
    private readonly expenseRepo: Repository<ExtraExpense>,
    @InjectRepository(ExtraIncome)
    private readonly incomeRepo: Repository<ExtraIncome>,
    private readonly telegramService: TelegramService,
  ) {}

  /** Extra income minus extra expenses recorded for this client, in entered USD amounts. */
  private async getEffectiveBalance(clientId: string): Promise<number> {
    const { totalExpenses } = await this.expenseRepo
      .createQueryBuilder('e')
      .select(
        'COALESCE(SUM(CAST(e.amount AS DECIMAL)), 0)',
        'totalExpenses',
      )
      .where('e.client_id = :clientId', { clientId })
      .andWhere('e.deleted_at IS NULL')
      .getRawOne();

    const { totalIncomes } = await this.incomeRepo
      .createQueryBuilder('i')
      .select(
        'COALESCE(SUM(CAST(i.amount AS DECIMAL)), 0)',
        'totalIncomes',
      )
      .where('i.client_id = :clientId', { clientId })
      .andWhere('i.deleted_at IS NULL')
      .getRawOne();

    return Math.round((parseFloat(totalIncomes) - parseFloat(totalExpenses)) * 100) / 100;
  }

  /**
   * If the effective balance (extra income − extra expenses) is non-positive,
   * send Telegram once per day.
   */
  async checkLowBalanceForClient(clientId: string): Promise<void> {
    const client = await this.clientRepo.findOne({
      where: { id: clientId, is_active: true },
    });

    if (!client) {
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const balance = await this.getEffectiveBalance(clientId);

    if (balance > 0) {
      return;
    }

    const alreadySentToday = await this.alertLogRepo.findOne({
      where: {
        client_id: client.id,
        alert_type: AlertType.LOW_BALANCE,
        sent_at: MoreThanOrEqual(todayStart),
      },
    });

    if (alreadySentToday) {
      return;
    }

    await this.telegramService.sendLowBalanceAlert({
      clientName: client.name,
      currentBalance: balance,
      threshold: 0,
      currency: 'USD',
    });

    await this.alertLogRepo.save(
      this.alertLogRepo.create({
        client_id: client.id,
        alert_type: AlertType.LOW_BALANCE,
        message: `Low balance alert: ${balance} USD`,
      }),
    );

    this.logger.log(`Low balance alert sent for client ${client.name}`);
  }

  /** Optional full scan (e.g. manual ops); low-balance Telegram is normally triggered after an expense is added. */
  async checkLowBalances(): Promise<void> {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    for (const client of clients) {
      await this.checkLowBalanceForClient(client.id);
    }
  }

  async sendBalanceReport(): Promise<void> {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    const reportData: Array<{
      clientName: string;
      balance: number;
      currency: string;
      status: 'ok' | 'warning' | 'critical';
    }> = [];

    for (const client of clients) {
      const balance = await this.getEffectiveBalance(client.id);
      const currency = 'USD';
      let status: 'ok' | 'warning' | 'critical' = 'ok';

      if (balance <= 0) {
        status = 'critical';
      }

      reportData.push({
        clientName: client.name,
        balance,
        currency,
        status,
      });
    }

    await this.telegramService.sendBalanceReport(reportData);

    await this.alertLogRepo.save(
      this.alertLogRepo.create({
        client_id: clients[0]?.id ?? '00000000-0000-0000-0000-000000000000',
        alert_type: AlertType.DAILY_REPORT,
        message: `Daily balance report sent for ${clients.length} clients`,
      }),
    );

    this.logger.log('Daily balance report sent');
  }

  async resetDailyAlerts(): Promise<void> {
    this.logger.log(
      'Daily alert reset called — no-op since alerts are checked by date',
    );
  }

  async getAlertConfig(): Promise<
    Array<{ clientId: string; clientName: string; threshold: number | null }>
  > {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    return clients.map((client) => ({
      clientId: client.id,
      clientName: client.name,
      threshold:
        client.balance_alert_threshold != null
          ? parseFloat(client.balance_alert_threshold)
          : null,
    }));
  }

  async updateAlertConfig(
    clientId: string,
    threshold: number | null,
  ): Promise<void> {
    await this.clientRepo.update(clientId, {
      balance_alert_threshold:
        threshold != null ? String(threshold) : null,
    });

    this.logger.log(
      `Alert threshold updated for client ${clientId}: ${threshold}`,
    );
  }
}
