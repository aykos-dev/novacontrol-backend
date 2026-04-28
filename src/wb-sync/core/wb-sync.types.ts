export type WbSyncOptions = {
  force?: boolean;
};

export type WbReportDailyRow = {
  date: string;
  income: number;
  expenses: number;
};

export type WbReportTotals = {
  income: number;
  expenses: number;
  retail_sales: number;
};

export type WbReportBreakdown = {
  retail_sales: number;
  ppvz_reward: number;
  delivery_rub: number;
  storage_fee: number;
  penalty: number;
  deduction: number;
  acceptance: number;
  rebill_logistic_cost: number;
};

export type WbReportResult = {
  daily: WbReportDailyRow[];
  totals: WbReportTotals;
  breakdown: WbReportBreakdown;
};

export type WbBalanceHistoryPoint = {
  date: string;
  current: number;
};

export type WbBalanceApiResponse = {
  balance?: number;
  availableForWithdraw?: number;
};

/** Thrown when WB report API returns 429 and we must stop; `retryAfterSeconds` comes from `X-Ratelimit-Retry` (seconds). */
export class WbReportRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(
      `WB report API rate limited; retry after ${retryAfterSeconds}s (X-Ratelimit-Retry)`,
    );
    this.name = 'WbReportRateLimitedError';
  }
}
