import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/client.entity.js';
import { AdminUser } from '../users/admin-user.entity.js';
import { WbSyncService } from '../wb-sync/wb-sync.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { IncomesService } from '../expenses/incomes.service.js';

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
    private readonly incomesService: IncomesService,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(AdminUser)
    private readonly userRepo: Repository<AdminUser>,
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
   * Full /report body (HTML-free plain text for Telegram).
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
      const incomeSummary = await this.incomesService.getSummary(
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

      lines.push(`💰 Доход WB (розница − сборы): ${this.fmt(wbNet)} KGS`);
      const bc = report.totals.balance_change ?? 0;
      lines.push(`⚖️ Изменение баланса WB: ${this.fmt(bc)} KGS`);
      lines.push('');

      if (summary.byCategory.length > 0) {
        lines.push('📦 Доп. расходы (KGS):');
        for (const row of summary.byCategory) {
          const icon = row.icon_emoji ?? '📌';
          lines.push(
            `  ${icon} ${row.name}: ${this.fmt(row.total)} ${row.currency}`,
          );
        }
        lines.push(`💵 Итого доп. расходов: ${this.fmt(summary.grandTotal)} KGS`);
      } else {
        lines.push('📦 Доп. расходы: нет записей');
      }

      const extra = summary.grandTotal;
      const extraInc = incomeSummary.grandTotal;
      if (extraInc > 0) {
        lines.push(`📥 Доп. пополнения (KGS): ${this.fmt(extraInc)} KGS`);
      }

      const realRev = wbNet - extra + extraInc;
      lines.push('');
      lines.push(`✅ Реальный доход: ${this.fmt(realRev)} KGS`);

      blocks.push(lines.join('\n'));
      blocks.push('');
    }

    return blocks.join('\n').trimEnd();
  }

  /** Net extra expenses (KGS) for one day; date defaults to UTC today (YYYY-MM-DD). */
  async buildExtraExpenseDayText(dateArg?: string): Promise<string> {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    const date =
      dateArg && re.test(dateArg)
        ? dateArg
        : new Date().toISOString().slice(0, 10);
    const total = await this.expensesService.sumExtraExpensesKgs({
      expenseDate: date,
    });
    return [
      `📦 Доп. расходы за ${date}`,
      `💵 Итого (нетто, KGS): ${this.fmt(total)}`,
    ].join('\n');
  }

  /** Net extra expenses by creators; empty tokens = all users, all dates. */
  async buildUserExpenseNetText(tokens: string[]): Promise<string> {
    const allUsers = await this.userRepo.find({
      where: { is_active: true },
      order: { username: 'ASC' },
    });

    if (tokens.length === 0) {
      const total = await this.expensesService.sumExtraExpensesKgs({});
      return [
        `👥 Все пользователи`,
        `📦 Доп. расходы (все даты)`,
        `💵 Итого (нетто, KGS): ${this.fmt(total)}`,
      ].join('\n');
    }

    const matched = new Map<string, AdminUser>();
    const notFound: string[] = [];
    for (const raw of tokens) {
      const t = raw.trim();
      if (!t) continue;
      const q = t.toLowerCase();
      const hits = allUsers.filter(
        (u) =>
          u.username.toLowerCase() === q ||
          u.username.toLowerCase().includes(q),
      );
      if (hits.length === 0) notFound.push(t);
      else hits.forEach((u) => matched.set(u.id, u));
    }

    const lines: string[] = [];
    if (notFound.length) {
      lines.push(`⚠️ Не найдены: ${notFound.join(', ')}`);
    }

    if (matched.size === 0) {
      return lines.join('\n').trimEnd() || 'Нет подходящих пользователей.';
    }

    const ids = [...matched.keys()];
    const total = await this.expensesService.sumExtraExpensesKgs({
      createdByUserIds: ids,
    });

    const names = [...matched.values()].map((u) => u.username).join(', ');
    lines.unshift(`👥 ${names}`);
    lines.push(`💵 Итого доп. расходов (KGS): ${this.fmt(total)}`);
    return lines.join('\n');
  }

  /** Net extra expenses by clients; empty tokens = all clients, all dates. */
  async buildClientExpenseNetText(tokens: string[]): Promise<string> {
    const all = await this.clientRepo.find({
      where: { is_active: true },
      order: { name: 'ASC' },
    });

    if (tokens.length === 0) {
      const total = await this.expensesService.sumExtraExpensesKgs({});
      return [
        `🏷️ Все клиенты`,
        `📦 Доп. расходы (все даты)`,
        `💵 Итого (нетто, KGS): ${this.fmt(total)}`,
      ].join('\n');
    }

    const matched = new Map<string, Client>();
    const notFound: string[] = [];
    for (const raw of tokens) {
      const t = raw.trim();
      if (!t) continue;
      const q = t.toLowerCase();
      const hits = all.filter(
        (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q,
      );
      if (hits.length === 0) notFound.push(t);
      else hits.forEach((c) => matched.set(c.id, c));
    }

    const lines: string[] = [];
    if (notFound.length) {
      lines.push(`⚠️ Не найдены: ${notFound.join(', ')}`);
    }

    if (matched.size === 0) {
      return lines.join('\n').trimEnd() || 'Нет подходящих клиентов.';
    }

    const ids = [...matched.keys()];
    const total = await this.expensesService.sumExtraExpensesKgs({
      clientIds: ids,
    });

    const names = [...matched.values()].map((c) => c.name).join(', ');
    lines.unshift(`🏷️ ${names}`);
    lines.push(`💵 Итого доп. расходов (KGS): ${this.fmt(total)}`);
    return lines.join('\n');
  }
}
