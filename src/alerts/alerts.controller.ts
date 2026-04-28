import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service.js';
import { UpdateAlertConfigDto } from './dto/update-alert-config.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('config')
  async getConfig() {
    return this.alertsService.getAlertConfig();
  }

  @Post('config')
  async updateConfig(@Body() dto: UpdateAlertConfigDto) {
    await this.alertsService.updateAlertConfig(dto.clientId, dto.threshold);
    return { success: true };
  }
}
