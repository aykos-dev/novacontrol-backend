import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';

const STATUS_ICONS: Record<string, string> = {
  ok: '✅',
  warning: '⚠️',
  critical: '🔴',
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string | undefined;
  private readonly groupId: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    this.groupId = this.configService.get<string>('TELEGRAM_GROUP_ID');
  }

  private formatNumber(n: number): string {
    const parts = n.toFixed(2).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = parts[1];

    // Drop decimal part if it's ".00"
    if (decPart === '00') {
      return intPart;
    }
    return `${intPart}.${decPart}`;
  }

  private telegramErrorDetail(error: unknown): string {
    if (isAxiosError(error)) {
      const data = error.response?.data;
      const desc =
        data && typeof data === 'object' && 'description' in data
          ? String((data as { description?: string }).description)
          : data != null
            ? JSON.stringify(data)
            : '';
      return [
        error.message,
        error.response?.status != null ? `HTTP ${error.response.status}` : '',
        desc,
      ]
        .filter(Boolean)
        .join(' — ');
    }
    return error instanceof Error ? error.message : String(error);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.botToken) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured — skipping notification',
      );
      return;
    }

    if (!this.groupId || this.groupId.trim() === '') {
      this.logger.warn(
        'TELEGRAM_GROUP_ID is not configured — skipping notification',
      );
      return;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const body = {
      chat_id: this.groupId,
      text,
      parse_mode: 'HTML',
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await axios.post(url, body);
        this.logger.log(
          `Telegram sendMessage ok (chat_id=${this.groupId}, length=${text.length} chars)`,
        );
        return;
      } catch (error) {
        this.logger.error(
          `Failed to send Telegram message (attempt ${attempt}/${maxAttempts}): ${this.telegramErrorDetail(error)}`,
        );

        if (attempt < maxAttempts) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  async sendExpenseCreatedAlert(data: {
    date: string;
    username: string;
    categoryLabel: string;
    amount: number;
    currency: string;
    note?: string | null;
  }): Promise<void> {
    const lines = [
      '✅ Записано',
      '',
      `📅 Дата: ${data.date}`,
      `👤 Пользователь: ${data.username}`,
      `📢 Категория: ${data.categoryLabel}`,
      `💰 Сумма: ${this.formatNumber(data.amount)} ${data.currency}`,
    ];

    if (data.note) {
      lines.push(`📝 Комментарий: ${data.note}`);
    }

    await this.sendMessage(lines.join('\n'));
  }

  async sendDailyExpenseReport(data: {
    date: string;
    clientReports: Array<{
      clientName: string;
      expenses: Array<{
        categoryLabel: string;
        amount: number;
        currency: string;
      }>;
      total: number;
      currency: string;
    }>;
    grandTotal: number;
    currency: string;
  }): Promise<void> {
    const lines: string[] = [`📊 Отчёт за ${data.date}`];

    for (const client of data.clientReports) {
      lines.push('');
      lines.push(`👤 ${client.clientName}`);

      for (const expense of client.expenses) {
        lines.push(
          `${expense.categoryLabel}: ${this.formatNumber(expense.amount)} ${expense.currency}`,
        );
      }

      lines.push(
        `💵 Итого: ${this.formatNumber(client.total)} ${client.currency}`,
      );
    }

    lines.push('');
    lines.push(
      `💰 Общий расход за день: ${this.formatNumber(data.grandTotal)} ${data.currency}`,
    );

    const payload = lines.join('\n');
    this.logger.log(
      `sendDailyExpenseReport: ${data.clientReports.length} client(s), date=${data.date}, grandTotal=${data.grandTotal} ${data.currency}`,
    );
    await this.sendMessage(payload);
  }

  async sendBalanceReport(
    data: Array<{
      clientName: string;
      balance: number;
      currency: string;
      status: 'ok' | 'warning' | 'critical';
    }>,
  ): Promise<void> {
    const lines: string[] = ['📊 Общий отчёт по клиентам'];

    for (const client of data) {
      const icon = STATUS_ICONS[client.status] ?? '';
      lines.push('');
      lines.push(
        `👤 ${client.clientName} — Баланс: ${this.formatNumber(client.balance)} ${client.currency} ${icon}`,
      );
    }

    await this.sendMessage(lines.join('\n'));
  }

  async sendLowBalanceAlert(data: {
    clientName: string;
    currentBalance: number;
    threshold: number;
    currency: string;
  }): Promise<void> {
    const deficit = data.threshold - data.currentBalance;

    const lines = [
      '🚨 Внимание! Низкий баланс',
      '',
      `👤 Клиент: ${data.clientName}`,
      `💰 Текущие расходы: ${this.formatNumber(data.currentBalance)} ${data.currency}`,
      `⚠️ Порог: ${this.formatNumber(data.threshold)} ${data.currency}`,
      `📉 Баланс ниже порога на: ${this.formatNumber(deficit)} ${data.currency}`,
      '',
      'Пожалуйста, пополните баланс.',
    ];

    await this.sendMessage(lines.join('\n'));
  }
}
