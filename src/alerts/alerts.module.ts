import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertLog } from './alert-log.entity.js';
import { Client } from '../clients/client.entity.js';
import { WbBalance } from '../wb-sync/wb-balance.entity.js';
import { ExtraExpense } from '../expenses/extra-expense.entity.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([AlertLog, Client, WbBalance, ExtraExpense])],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
