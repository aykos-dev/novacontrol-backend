import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/client.entity.js';
import { WbSyncService } from '../wb-sync/wb-sync.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';

const WB_BREAKDOWN: {
  key:
    | 'ppvz_reward'
    | 'delivery_rub'
    | 'storage_fee'
    | 'rebill_logistic_cost'
    | 'penalty'
    | 'deduction'
    | 'acceptance';
  label: string;
}[] = [
  { key: 'ppvz_reward', label: 'Комиссия WB' },
  { key: 'delivery_rub', label: 'Логистика' },
  { key: 'storage_fee', label: 'Хранение' },
  { key: 'rebill_logistic_cost', label: 'Корректировка ВВ' },
  { key: 'penalty', label: 'Штрафы' },
  { key: 'deduction', label: 'Удержания' },
  { key: 'acceptance', label: 'Операции при приемке' },
];

@Injectable()
export class BotService {
  constructor(
    private readonly wbSyncService: WbSyncService,
    private readonly expensesService: ExpensesService,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
  ) {}

  private fmt(n: number): string {
    return n.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private negFmt(n: number): string {
    if (n === 0) return '0,00';
    return `−${this.fmt(Math.abs(n))}`;
  }

  private async resolveClients(clientFilter?: string): Promise<Client[]> {
    const all = await this.clientRepo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });
    if (!clientFilter?.trim()) return all;
    const q = clientFilter.trim().toLowerCase();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q,
    );
  }

  /**
   * Full /info and /report body (HTML-free plain text for Telegram).
   */
  async buildReportText(
    dateFrom: string,
    dateTo: string,
    clientFilter?: string,
  ): Promise<string> {
    const clients = await this.resolveClients(clientFilter);

    if (clients.length === 0) {
      return clientFilter?.trim()
        ? `Клиенты по запросу «${clientFilter.trim()}» не найдены.`
        : 'Нет активных клиентов.';
    }

    const singleDay = dateFrom === dateTo;
    const header = singleDay
      ? `📊 Отчёт за ${dateFrom}`
      : `📊 Отчёт за ${dateFrom} — ${dateTo}`;

    const blocks: string[] = [header, ''];

    for (const client of clients) {
      const report = await this.wbSyncService.getReport(
        client.id,
        dateFrom,
        dateTo,
      );
      const summary = await this.expensesService.getSummary(
        client.id,
        dateFrom,
        dateTo,
      );

      const income = report.totals.income;
      const expTotal = report.totals.expenses;
      const wbNet = income - expTotal;

      const lines: string[] = [];
      lines.push(`👤 ${client.name}`);
      lines.push(`📈 Приход: ${this.fmt(income)} KGS`);
      lines.push(`📉 Расход: ${this.negFmt(expTotal)} KGS`);

      const br = report.breakdown;
      const treeKeys = WB_BREAKDOWN.filter((w) => Math.abs(br[w.key] as number) > 0.0001);
      const lastIdx = treeKeys.length - 1;
      treeKeys.forEach((w, i) => {
        const val = br[w.key] as number;
        const prefix = i === lastIdx ? '  └' : '  ├';
        lines.push(`${prefix} ${w.label}: ${this.negFmt(val)} KGS`);
      });

      lines.push(`💰 Доход WB: ${this.fmt(wbNet)} KGS`);
      lines.push('');

      if (summary.byCategory.length > 0) {
        lines.push('📦 Доп. расходы:');
        for (const row of summary.byCategory) {
          const icon = row.icon_emoji ?? '📌';
          lines.push(
            `  ${icon} ${row.name}: ${this.fmt(row.total)} ${row.currency}`,
          );
        }
        lines.push(
          `💵 Итого расходов: ${this.fmt(summary.grandTotal)} ${
            summary.byCategory[0]?.currency ?? 'USD'
          }`,
        );
      } else {
        lines.push('📦 Доп. расходы: нет записей');
      }

      const extra = summary.grandTotal;
      const cur0 = summary.byCategory[0]?.currency ?? 'USD';
      lines.push('');
      lines.push(
        `✅ Реальный доход (WB−доп.): ${this.fmt(wbNet)} KGS − ${this.fmt(extra)} ${cur0} (валюты могут различаться)`,
      );

      blocks.push(lines.join('\n'));
      blocks.push('');
    }

    return blocks.join('\n').trimEnd();
  }

  async buildBalanceText(): Promise<string> {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });

    if (clients.length === 0) {
      return 'Нет активных клиентов.';
    }

    const lines: string[] = ['💼 Балансы клиентов', ''];

    for (const c of clients) {
      const bal = await this.wbSyncService.getBalance(c.id);
      const amount = bal ? parseFloat(String(bal.current)) : 0;
      const cur = bal?.currency ?? c.currency ?? 'RUB';
      const formatted = `${this.fmt(amount)} ${cur}`;

      const threshold =
        c.balance_alert_threshold != null
          ? parseFloat(String(c.balance_alert_threshold))
          : null;

      let suffix = '✅';
      if (threshold != null) {
        if (amount < threshold) suffix = '🔴 (ниже порога)';
        else if (amount < threshold * 1.2) suffix = '⚠️ (около порога)';
      }

      lines.push(`👤 ${c.name} — ${formatted} ${suffix}`);
    }

    return lines.join('\n');
  }
}
