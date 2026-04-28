import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { WbSyncModule } from './wb-sync/wb-sync.module.js';
import { ExpensesModule } from './expenses/expenses.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { BotModule } from './bot/bot.module.js';
import { WbApiModule } from './common/wb-api/wb-api.module.js';
import { AppController } from './app.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'wb_user'),
        password: config.get('DATABASE_PASSWORD', 'wb_password'),
        database: config.get('DATABASE_NAME', 'wb_analytics'),
        autoLoadEntities: true,
        synchronize: config.get('DATABASE_SYNC', 'true') === 'true',
      }),
    }),
    WbApiModule,
    ScheduleModule.forRoot(),
    TelegramModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    AlertsModule,
    ExpensesModule,
    WbSyncModule,
    BotModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
