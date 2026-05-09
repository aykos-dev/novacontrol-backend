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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY_DATE_RE = /^\d{2}-\d{2}-\d{4}$/;

function isoToDisplay(date: string): string {
  if (!ISO_DATE_RE.test(date)) return date;
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

function displayToIso(date: string): string {
  if (DISPLAY_DATE_RE.test(date)) {
    const [day, month, year] = date.split('-');
    return `${year}-${month}-${day}`;
  }
  return date;
}

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

  private currentDate(): string {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Tashkent',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  }

  private resolveDate(dateArg?: string): string {
    const normalized = dateArg ? displayToIso(dateArg) : undefined;
    return normalized && ISO_DATE_RE.test(normalized)
      ? normalized
      : this.currentDate();
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
      ? `📊 Отчёт за ${isoToDisplay(dateFrom)}`
      : `📊 Отчёт за ${isoToDisplay(dateFrom)} — ${isoToDisplay(dateTo)}`;

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

  async buildDailyExtraExpenseReportText(dateArg?: string): Promise<string> {
    const date = this.resolveDate(dateArg);
    const clientReports =
      await this.expensesService.getExpenseCategoryReportByClient(date);

    if (clientReports.length === 0) {
      return [`📅  Отчёт за ${isoToDisplay(date)}`, '', 'Доп. расходов за день нет.'].join(
        '\n',
      );
    }

    const blocks: string[] = [`📅  Отчёт за ${isoToDisplay(date)}`];

    for (const client of clientReports) {
      blocks.push('');
      blocks.push(`📁 ${client.clientName}`);

      for (const expense of client.expenses) {
        const icon = expense.iconEmoji ?? '📌';
        blocks.push(
          `${icon} ${expense.categoryName}: ${this.fmt(expense.amount)} ${expense.currency}`,
        );
      }

      blocks.push(`💵 Итого: ${this.fmt(client.total)} ${client.currency}`);
    }

    return blocks.join('\n');
  }

  async buildBalanceText(dateArg?: string): Promise<string> {
    const date = this.resolveDate(dateArg);
    const clients = await this.resolveClients();

    if (clients.length === 0) {
      return 'Нет активных клиентов.';
    }

    const blocks: string[] = [`📅  Отчёт за ${isoToDisplay(date)}`];

    for (const client of clients) {
      const todayIncomes = await this.incomesService.findEntriesByClientForDate(
        client.id,
        date,
      );
      if (todayIncomes.length === 0) {
        continue;
      }

      const totalIncomeToday = todayIncomes.reduce(
        (sum, income) => sum + income.amount,
        0,
      );
      const totalIncomeAll =
        await this.incomesService.sumExtraIncomesOriginalAmount({
          clientId: client.id,
        });
      const totalExpenseAll =
        await this.expensesService.sumExtraExpensesOriginalAmount({
          clientId: client.id,
        });
      const balance = Math.round((totalIncomeAll - totalExpenseAll) * 100) / 100;

      blocks.push('');
      blocks.push(`📁 ${client.name}`);

      for (const income of todayIncomes) {
        blocks.push(
          `✅ Пополнениe: ${this.fmt(income.amount)} ${income.currency}`,
        );
      }

      blocks.push(`💵 Итого: ${this.fmt(totalIncomeToday)} USD`);
      blocks.push(`💰Баланс: ${this.fmt(balance)} USD`);
    }

    if (blocks.length === 1) {
      blocks.push('');
      blocks.push('Пополнений за день нет.');
    }

    return blocks.join('\n');
  }

  async buildViruchkaText(dateArg?: string): Promise<string> {
    const date = this.resolveDate(dateArg);
    const clients = await this.resolveClients();

    if (clients.length === 0) {
      return 'Нет активных клиентов.';
    }

    const blocks: string[] = [`📅 Отчёт за ${isoToDisplay(date)}`];

    for (const client of clients) {
      const extraIncome = await this.incomesService.sumExtraIncomesOriginalAmount({
        clientId: client.id,
        incomeDate: date,
      });
      const extraExpense = await this.expensesService.sumExtraExpensesOriginalAmount({
        clientId: client.id,
        expenseDate: date,
      });
      const report = await this.wbSyncService.getReport(client.id, date, date);
      const revenue = report.totals.income - report.totals.expenses;
      const netRevenue = revenue - extraExpense;

      blocks.push('');
      blocks.push('🚪 Кабинет');
      blocks.push(`📁 ${client.name}`);
      blocks.push(`📥 Пополнение: ${this.fmt(extraIncome)} USD`);
      blocks.push(`🛒 Доп. расходы: ${this.fmt(extraExpense)} USD`);
      blocks.push(`💸 Чис. Выручка: ${this.fmt(netRevenue)} KGS`);
    }

    return blocks.join('\n');
  }

  /** Net extra expenses (KGS) for one day; date defaults to today, input may be DD-MM-YYYY. */
  async buildExtraExpenseDayText(dateArg?: string): Promise<string> {
    const date = this.resolveDate(dateArg);
    const total = await this.expensesService.sumExtraExpensesKgs({
      expenseDate: date,
    });
    return [
      `📦 Доп. расходы за ${isoToDisplay(date)}`,
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
