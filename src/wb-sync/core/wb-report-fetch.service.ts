import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AxiosError } from 'axios';
import { WbReportRow } from '../wb-report-row.entity.js';
import { WbApiHttpService } from '../../common/wb-api/wb-api-http.service.js';
import { WbReportRateLimitedError } from './wb-sync.types.js';
import {
  RATE_LIMIT_MS,
  WB_RATE_LIMIT_BUFFER_SEC,
  WB_REPORT_PAGE_GAP_MS,
  WB_SALES_REPORTS_DETAILED_LIMIT,
  WB_SALES_REPORTS_DETAILED_URL,
} from './wb-sync.constants.js';
import {
  formatWbDate,
  parseXRateLimitRetrySeconds,
  sleepMs,
} from './wb-sync.utils.js';
import { financeDetailedRowToLegacyShape } from './wb-finance-sales-row.mapper.js';

@Injectable()
export class WbReportFetchService {
  private readonly logger = new Logger(WbReportFetchService.name);

  constructor(
    @InjectRepository(WbReportRow)
    private readonly reportRowRepo: Repository<WbReportRow>,
    private readonly wbApiHttp: WbApiHttpService,
  ) {}

  async fetchAndUpsertAllPages(
    token: string,
    clientId: string,
  ): Promise<number> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dateFrom = formatWbDate(thirtyDaysAgo);
    const dateTo = formatWbDate(now);

    let rrdid = 0;
    let totalRows = 0;

    while (true) {
      const data = await this.fetchPage(
        token,
        dateFrom,
        dateTo,
        rrdid,
        clientId,
      );

      if (!data || data.length === 0) {
        break;
      }

      await this.upsertRows(data, clientId);
      totalRows += data.length;

      const lastRow = data[data.length - 1] as Record<string, unknown>;
      const nextRrd = lastRow.rrdId ?? lastRow.rrd_id;
      rrdid =
        typeof nextRrd === 'number'
          ? nextRrd
          : parseInt(String(nextRrd), 10);
      if (!Number.isFinite(rrdid)) {
        this.logger.warn(
          `Stopping report pagination: invalid rrdId on last row for client ${clientId}`,
        );
        break;
      }

      this.logger.log(
        `Fetched & saved page for client ${clientId}: ${data.length} rows (total: ${totalRows}), last rrdId=${rrdid}`,
      );

      this.logger.log(
        `Waiting ${WB_REPORT_PAGE_GAP_MS / 1000}s before next page (finance API rate limit)...`,
      );
      await sleepMs(WB_REPORT_PAGE_GAP_MS);
    }

    return totalRows;
  }

  private async fetchPage(
    token: string,
    dateFrom: string,
    dateTo: string,
    rrdid: number,
    clientId: string,
    retriesLeft = 2,
  ): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.wbApiHttp.post<unknown>(
        WB_SALES_REPORTS_DETAILED_URL,
        {
          dateFrom,
          dateTo,
          limit: WB_SALES_REPORTS_DETAILED_LIMIT,
          rrdId: rrdid,
          period: 'daily',
        },
        {
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          timeout: 120_000,
          wbContext: { clientId },
        },
      );

      if (response.status === 204) {
        return [];
      }

      const data = response.data;
      if (data == null) {
        return [];
      }
      if (!Array.isArray(data)) {
        this.logger.warn(
          `Unexpected sales-reports/detailed payload for client ${clientId}: not an array`,
        );
        return [];
      }
      return data as Record<string, unknown>[];
    } catch (error: any) {
      if (error instanceof AxiosError && error.response?.status === 429) {
        const headerSec = parseXRateLimitRetrySeconds(error.response.headers);
        const waitSec = headerSec ?? 65;
        const retryAfterMs = (waitSec + WB_RATE_LIMIT_BUFFER_SEC) * 1000;

        if (retriesLeft <= 0) {
          const rescheduleSec =
            headerSec ?? Math.floor(RATE_LIMIT_MS / 1000);
          this.logger.warn(
            `Rate limited by WB API for client ${clientId}, no retries left — reschedule in ${rescheduleSec}s (X-Ratelimit-Retry or fallback)`,
          );
          throw new WbReportRateLimitedError(rescheduleSec);
        }

        this.logger.warn(
          `Rate limited by WB API. Retrying in ${retryAfterMs / 1000}s (${retriesLeft} retries left)`,
        );
        await sleepMs(retryAfterMs);

        return this.fetchPage(
          token,
          dateFrom,
          dateTo,
          rrdid,
          clientId,
          retriesLeft - 1,
        );
      }
      throw error;
    }
  }

  private async upsertRows(
    rows: Record<string, unknown>[],
    clientId: string,
  ): Promise<void> {
    if (rows.length === 0) return;

    const batchSize = 500;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      const entities = batch.map((row) => {
        const l = financeDetailedRowToLegacyShape(row);
        return this.reportRowRepo.create({
          client_id: clientId,
          rrd_id: String(l.rrd_id),
          realizationreport_id: String(l.realizationreport_id),
          rr_dt: String(l.rr_dt),
          supplier_oper_name: String(l.supplier_oper_name ?? ''),
          retail_price_withdisc_rub: String(l.retail_price_withdisc_rub ?? 0),
          ppvz_for_pay: String(l.ppvz_for_pay ?? 0),
          ppvz_reward: String(l.ppvz_reward ?? 0),
          delivery_rub: String(l.delivery_rub ?? 0),
          storage_fee: String(l.storage_fee ?? 0),
          penalty: String(l.penalty ?? 0),
          deduction: String(l.deduction ?? 0),
          acceptance: String(l.acceptance ?? 0),
          rebill_logistic_cost: String(l.rebill_logistic_cost ?? 0),
          nm_id: String(l.nm_id ?? 0),
          sa_name: String(l.sa_name ?? ''),
          raw_data: row,
        });
      });

      await this.reportRowRepo
        .createQueryBuilder()
        .insert()
        .into(WbReportRow)
        .values(entities)
        .orUpdate(
          [
            'realizationreport_id',
            'rr_dt',
            'supplier_oper_name',
            'retail_price_withdisc_rub',
            'ppvz_for_pay',
            'ppvz_reward',
            'delivery_rub',
            'storage_fee',
            'penalty',
            'deduction',
            'acceptance',
            'rebill_logistic_cost',
            'nm_id',
            'sa_name',
            'raw_data',
            'fetched_at',
          ],
          ['client_id', 'rrd_id'],
        )
        .execute();
    }
  }
}
