import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncLog, SyncStatus } from './sync-log.entity.js';
import { Client } from '../clients/client.entity.js';
import { ClientsService } from '../clients/clients.service.js';
import { WbBalance } from './wb-balance.entity.js';
import {
  WbReportRateLimitedError,
  type WbBalanceHistoryPoint,
  type WbReportResult,
  type WbSyncOptions,
} from './core/wb-sync.types.js';
import {
  RATE_LIMIT_MS,
  WB_RATE_LIMIT_BUFFER_SEC,
} from './core/wb-sync.constants.js';
import { WbReportFetchService } from './core/wb-report-fetch.service.js';
import { WbReportQueryService } from './core/wb-report-query.service.js';
import { WbBalanceSyncService } from './core/wb-balance-sync.service.js';

@Injectable()
export class WbSyncService {
  private readonly logger = new Logger(WbSyncService.name);

  constructor(
    @InjectRepository(SyncLog)
    private readonly syncLogRepo: Repository<SyncLog>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @Inject(forwardRef(() => ClientsService))
    private readonly clientsService: ClientsService,
    private readonly reportFetch: WbReportFetchService,
    private readonly reportQuery: WbReportQueryService,
    private readonly balanceSync: WbBalanceSyncService,
  ) {}

  async syncClient(
    clientId: string,
    options?: WbSyncOptions,
  ): Promise<SyncLog> {
    const client = await this.clientsService.findOneWithToken(clientId);
    const nowMs = Date.now();

    if (!options?.force && client.report_sync_not_before) {
      const untilMs = new Date(client.report_sync_not_before).getTime();
      if (untilMs > nowMs) {
        const retryInSec = Math.ceil((untilMs - nowMs) / 1000);
        this.logger.log(
          `Skipping report sync for client ${clientId}: WB rate limit until ${client.report_sync_not_before.toISOString()} (~${retryInSec}s)`,
        );
        const skipped = this.syncLogRepo.create({
          client_id: clientId,
          status: SyncStatus.RATE_LIMITED,
          started_at: new Date(),
          finished_at: new Date(),
          error_message: `Rate-limited (X-Ratelimit-Retry): retry after ${client.report_sync_not_before.toISOString()}`,
        });
        return this.syncLogRepo.save(skipped);
      }
    }

    if (!options?.force && client.last_sync_at) {
      const elapsed = nowMs - new Date(client.last_sync_at).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const retryInH = Math.ceil((RATE_LIMIT_MS - elapsed) / 3_600_000);
        this.logger.log(
          `Skipping report sync for client ${clientId}: last synced ${client.last_sync_at.toISOString()}, retry in ~${retryInH}h`,
        );
        const skipped = this.syncLogRepo.create({
          client_id: clientId,
          status: SyncStatus.RATE_LIMITED,
          started_at: new Date(),
          finished_at: new Date(),
          error_message: `Rate-limited: last synced ${client.last_sync_at.toISOString()}, retry in ~${retryInH}h`,
        });
        return this.syncLogRepo.save(skipped);
      }
    }

    const syncLog = this.syncLogRepo.create({
      client_id: clientId,
      status: SyncStatus.RUNNING,
      started_at: new Date(),
    });
    await this.syncLogRepo.save(syncLog);

    try {
      const totalRows = await this.reportFetch.fetchAndUpsertAllPages(
        client.wb_token,
        clientId,
      );

      syncLog.status = SyncStatus.SUCCESS;
      syncLog.rows_fetched = totalRows;
      syncLog.finished_at = new Date();
      await this.syncLogRepo.save(syncLog);

      await this.clientRepo.update(clientId, {
        last_sync_at: new Date(),
        report_sync_not_before: null,
      });

      this.logger.log(
        `Sync completed for client ${clientId}: ${totalRows} rows`,
      );

      // Fetch balance after report sync
      await this.balanceSync.fetchBalanceForClient(clientId).catch((err) =>
        this.logger.error(`Balance fetch failed for client ${clientId}: ${err?.message}`),
      );

      return syncLog;
    } catch (error: unknown) {
      if (error instanceof WbReportRateLimitedError) {
        const until = new Date(
          Date.now() +
            (error.retryAfterSeconds + WB_RATE_LIMIT_BUFFER_SEC) * 1000,
        );
        await this.clientRepo.update(clientId, {
          report_sync_not_before: until,
        });
        syncLog.status = SyncStatus.RATE_LIMITED;
        syncLog.error_message = `WB API rate limited (X-Ratelimit-Retry=${error.retryAfterSeconds}s); next sync after ${until.toISOString()}`;
        syncLog.finished_at = new Date();
        await this.syncLogRepo.save(syncLog);
        this.logger.warn(
          `Report sync rate-limited for client ${clientId}: ${syncLog.error_message}`,
        );
        return syncLog;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown error during sync';
      syncLog.status = SyncStatus.FAILED;
      syncLog.error_message = message;
      syncLog.finished_at = new Date();
      await this.syncLogRepo.save(syncLog);

      this.logger.error(
        `Sync failed for client ${clientId}: ${syncLog.error_message}`,
      );
      return syncLog;
    }
  }

  async getReport(
    clientId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<WbReportResult> {
    return this.reportQuery.getReport(clientId, dateFrom, dateTo);
  }

  async getBalance(clientId: string): Promise<WbBalance | null> {
    return this.balanceSync.getBalance(clientId);
  }

  async getBalanceHistory(
    clientId: string,
    days?: number,
  ): Promise<WbBalanceHistoryPoint[]> {
    return this.balanceSync.getBalanceHistory(clientId, days);
  }

  async syncAllClients(options?: WbSyncOptions): Promise<void> {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    this.logger.log(`Starting sync for ${clients.length} clients`);

    const results = await Promise.allSettled(
      clients.map((client) => this.syncClient(client.id, options)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const client = clients[i];
      if (result.status === 'rejected') {
        this.logger.error(
          `Sync failed for client ${client.name}: ${result.reason}`,
        );
      }
    }

    this.logger.log('All client syncs completed');

    this.logger.log('Fetching balances for all clients');
    await this.balanceSync.fetchAllBalances(options);
  }

  async fetchBalanceForClient(
    clientId: string,
    options?: WbSyncOptions,
  ): Promise<WbBalance | null> {
    return this.balanceSync.fetchBalanceForClient(clientId, options);
  }

  async fetchAllBalances(options?: WbSyncOptions): Promise<void> {
    return this.balanceSync.fetchAllBalances(options);
  }
}
