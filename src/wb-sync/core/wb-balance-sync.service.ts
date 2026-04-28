import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WbBalance } from '../wb-balance.entity.js';
import { Client } from '../../clients/client.entity.js';
import { decrypt } from '../../common/crypto/crypto.util.js';
import { WbApiHttpService } from '../../common/wb-api/wb-api-http.service.js';
import type {
  WbBalanceApiResponse,
  WbBalanceHistoryPoint,
  WbSyncOptions,
} from './wb-sync.types.js';
import { RATE_LIMIT_MS, WB_BALANCE_URL } from './wb-sync.constants.js';
import { formatWbDate } from './wb-sync.utils.js';

@Injectable()
export class WbBalanceSyncService {
  private readonly logger = new Logger(WbBalanceSyncService.name);

  constructor(
    @InjectRepository(WbBalance)
    private readonly balanceRepo: Repository<WbBalance>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    private readonly configService: ConfigService,
    private readonly wbApiHttp: WbApiHttpService,
  ) {}

  private get encryptionKey(): string {
    return this.configService.getOrThrow<string>('WB_TOKEN_ENCRYPTION_KEY');
  }

  async getBalance(clientId: string): Promise<WbBalance | null> {
    return this.balanceRepo.findOne({
      where: { client_id: clientId },
      order: { snapshot_at: 'DESC' },
    });
  }

  /** One balance point per calendar day (latest snapshot that day), last `days` days. */
  async getBalanceHistory(
    clientId: string,
    days = 7,
  ): Promise<WbBalanceHistoryPoint[]> {
    const safeDays = Math.min(Math.max(days, 1), 90);
    const since = new Date();
    since.setDate(since.getDate() - safeDays - 1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.balanceRepo.find({
      where: { client_id: clientId },
      order: { snapshot_at: 'ASC' },
    });

    const filtered = rows.filter((r) => new Date(r.snapshot_at) >= since);

    const byDay = new Map<string, WbBalance>();
    for (const r of filtered) {
      const d = new Date(r.snapshot_at);
      const day = formatWbDate(d);
      const prev = byDay.get(day);
      if (!prev || new Date(r.snapshot_at) > new Date(prev.snapshot_at)) {
        byDay.set(day, r);
      }
    }

    const sorted = Array.from(byDay.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    const tail = sorted.slice(-safeDays);
    return tail.map(([date, b]) => ({
      date,
      current: Math.round(parseFloat(b.current) * 100) / 100,
    }));
  }

  async fetchBalanceForClient(
    clientId: string,
    options?: WbSyncOptions,
  ): Promise<WbBalance | null> {
    const client = await this.clientRepo.findOne({
      where: { id: clientId, is_active: true },
    });
    if (!client) return null;

    if (!options?.force && client.last_balance_sync_at) {
      const elapsed =
        Date.now() - new Date(client.last_balance_sync_at).getTime();
      if (elapsed < RATE_LIMIT_MS) {
        this.logger.log(
          `Skipping balance fetch for client ${clientId}: last fetched ${client.last_balance_sync_at.toISOString()}`,
        );
        return this.balanceRepo.findOne({
          where: { client_id: clientId },
          order: { snapshot_at: 'DESC' },
        });
      }
    }

    const token = decrypt(client.wb_token, this.encryptionKey);

    try {
      const response = await this.wbApiHttp.get<WbBalanceApiResponse>(
        WB_BALANCE_URL,
        {
          headers: { Authorization: token },
          timeout: 15_000,
          wbContext: { clientId },
        },
      );

      const balanceData = response.data;
      const balance = this.balanceRepo.create({
        client_id: clientId,
        current: String(balanceData?.balance ?? 0),
        for_withdraw: String(balanceData?.availableForWithdraw ?? 0),
        currency: client.currency,
        raw_data: balanceData ?? null,
      });

      const saved = await this.balanceRepo.save(balance);
      await this.clientRepo.update(clientId, {
        last_balance_sync_at: new Date(),
      });
      return saved;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch balance for client ${client.name}: ${error?.message}`,
      );
      return null;
    }
  }

  async fetchAllBalances(options?: WbSyncOptions): Promise<void> {
    const clients = await this.clientRepo.find({
      where: { is_active: true },
    });

    this.logger.log(`Fetching balances for ${clients.length} clients`);

    const results = await Promise.allSettled(
      clients.map((client) =>
        this.fetchBalanceForClient(client.id, options),
      ),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const client = clients[i];
      if (result.status === 'rejected') {
        this.logger.error(
          `Balance fetch failed for client ${client.name}: ${result.reason}`,
        );
      }
    }

    this.logger.log('All balance fetches completed');
  }
}
