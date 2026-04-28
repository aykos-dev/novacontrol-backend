import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WbReportRow } from './wb-report-row.entity.js';
import { WbBalance } from './wb-balance.entity.js';
import { SyncLog } from './sync-log.entity.js';
import { Client } from '../clients/client.entity.js';
import { ExtraExpense } from '../expenses/extra-expense.entity.js';
import { ClientsModule } from '../clients/clients.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { WbSyncService } from './wb-sync.service.js';
import { WbReportFetchService } from './core/wb-report-fetch.service.js';
import { WbReportQueryService } from './core/wb-report-query.service.js';
import { WbBalanceSyncService } from './core/wb-balance-sync.service.js';
import { WbSyncController } from './wb-sync.controller.js';
import { SchedulerController } from './scheduler.controller.js';
import { SchedulerService } from './scheduler.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WbReportRow, WbBalance, SyncLog, Client, ExtraExpense]),
    forwardRef(() => ClientsModule),
    AlertsModule,
  ],
  providers: [
    WbReportFetchService,
    WbReportQueryService,
    WbBalanceSyncService,
    WbSyncService,
    SchedulerService,
  ],
  controllers: [WbSyncController, SchedulerController],
  exports: [WbSyncService],
})
export class WbSyncModule {}
