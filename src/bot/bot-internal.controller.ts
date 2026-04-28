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

  @Get('balance')
  async balance(): Promise<{ text: string }> {
    const text = await this.botService.buildBalanceText();
    return { text };
  }
}
