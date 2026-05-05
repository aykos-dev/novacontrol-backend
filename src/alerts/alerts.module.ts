import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertLog } from './alert-log.entity.js';
import { Client } from '../clients/client.entity.js';
import { ExtraExpense } from '../expenses/extra-expense.entity.js';
import { ExtraIncome } from '../expenses/extra-income.entity.js';
import { AlertsService } from './alerts.service.js';
import { AlertsController } from './alerts.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AlertLog,
      Client,
      ExtraExpense,
      ExtraIncome,
    ]),
  ],
  providers: [AlertsService],
  controllers: [AlertsController],
  exports: [AlertsService],
})
export class AlertsModule {}
