import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { WbSyncService } from './wb-sync.service.js';

@Controller('wb')
@UseGuards(JwtAuthGuard)
export class WbSyncController {
  constructor(private readonly wbSyncService: WbSyncService) {}

  @Post('sync/:clientId')
  async triggerSync(
    @Param('clientId') clientId: string,
    @Query('force') force?: string,
  ) {
    return this.wbSyncService.syncClient(clientId, {
      force: force === 'true',
    });
  }

  @Get('report/:clientId')
  async getReport(
    @Param('clientId') clientId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.wbSyncService.getReport(clientId, dateFrom, dateTo);
  }

  @Get('balance/:clientId/history')
  async getBalanceHistory(
    @Param('clientId') clientId: string,
    @Query('days') days?: string,
  ) {
    const n = days ? parseInt(days, 10) : 7;
    return this.wbSyncService.getBalanceHistory(clientId, Number.isFinite(n) ? n : 7);
  }

  @Get('balance/:clientId')
  async getBalance(@Param('clientId') clientId: string) {
    const existing = await this.wbSyncService.getBalance(clientId);
    if (existing) return existing;
    // No snapshot yet — fetch one on the fly
    return this.wbSyncService.fetchBalanceForClient(clientId) ?? null;
  }
}
