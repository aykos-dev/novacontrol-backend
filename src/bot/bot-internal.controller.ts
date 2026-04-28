import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { BotService } from './bot.service.js';
import { BotAuthGuard } from './guards/bot-auth.guard.js';

@SkipThrottle()
@Controller('internal/bot')
@UseGuards(BotAuthGuard)
export class BotInternalController {
  constructor(private readonly botService: BotService) {}

  @Get('report')
  async report(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('client') client?: string,
  ): Promise<{ text: string }> {
    const from = dateFrom?.trim();
    const to = dateTo?.trim();
    if (!from || !to) {
      return { text: 'Укажите dateFrom и dateTo (YYYY-MM-DD).' };
    }
    const text = await this.botService.buildReportText(from, to, client);
    return { text };
  }

  /** Net extra expenses (KGS) for a single calendar day. Defaults to today if date omitted. */
  @Get('expense')
  async expense(@Query('date') date?: string): Promise<{ text: string }> {
    const text = await this.botService.buildExtraExpenseDayText(date?.trim());
    return { text };
  }

  /** Comma-separated usernames; omit or empty = all users. Net extra expenses (KGS), all dates. */
  @Get('userinfo')
  async userinfo(@Query('users') users?: string): Promise<{ text: string }> {
    const tokens = users
      ? users
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const text = await this.botService.buildUserExpenseNetText(tokens);
    return { text };
  }

  /** Comma-separated client name/id fragments; omit or empty = all clients. Net extra expenses (KGS), all dates. */
  @Get('clientinfo')
  async clientinfo(@Query('clients') clients?: string): Promise<{ text: string }> {
    const tokens = clients
      ? clients
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const text = await this.botService.buildClientExpenseNetText(tokens);
    return { text };
  }
}
