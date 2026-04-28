import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../clients/client.entity.js';
import { WbSyncModule } from '../wb-sync/wb-sync.module.js';
import { ExpensesModule } from '../expenses/expenses.module.js';
import { BotService } from './bot.service.js';
import { BotInternalController } from './bot-internal.controller.js';
import { BotAuthGuard } from './guards/bot-auth.guard.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Client]),
    WbSyncModule,
    ExpensesModule,
  ],
  controllers: [BotInternalController],
  providers: [BotService, BotAuthGuard],
  exports: [BotService],
})
export class BotModule {}
