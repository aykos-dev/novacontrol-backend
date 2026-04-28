/** Report summaries only (reportId, period totals). Not a substitute for detailed rows. */
export const WB_SALES_REPORTS_LIST_URL =
  'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/list';

/** Line-level sales / realization rows (replaces deprecated statistics `reportDetailByPeriod`). */
export const WB_SALES_REPORTS_DETAILED_URL =
  'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';

export const WB_BALANCE_URL =
  'https://common-api.wildberries.ru/api/v1/account/balance';

/** Client-side throttle: min interval between report syncs / balance fetches.
 *  Controlled via SYNC_RATE_LIMIT_MIN env var (default 5 minutes). */
export const RATE_LIMIT_MS = parseInt(
  process.env.SYNC_RATE_LIMIT_MIN ?? '5',
  10,
) * 60 * 1000;

/** Seconds added to `X-Ratelimit-Retry` when waiting or persisting `report_sync_not_before`. */
export const WB_RATE_LIMIT_BUFFER_SEC = 5;

/** Finance sales-reports methods: 1 req / min per seller — stay above 60s between pages. */
export const WB_REPORT_PAGE_GAP_MS = 65_000;

/** Max rows per `sales-reports/detailed` request (WB default 100000, cap per spec). */
export const WB_SALES_REPORTS_DETAILED_LIMIT = 100_000;
