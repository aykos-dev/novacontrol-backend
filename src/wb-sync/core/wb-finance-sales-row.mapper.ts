/**
 * WB commission in rubles: prefer explicit `ppvzSalesCommission`, else
 * `retailPriceWithDisc * commissionPercent / 100`, else legacy `ppvzReward`.
 */
export function deriveWbCommissionRub(
  raw: Record<string, unknown>,
): number {
  const num = (v: unknown): number => {
    if (v == null || v === '') return 0;
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : 0;
  };
  const retail = num(
    raw.retailPriceWithDisc ?? raw.retail_price_withdisc_rub,
  );
  const pct = num(raw.commissionPercent ?? raw.commission_percent);
  const explicit = num(
    raw.ppvzSalesCommission ?? raw.ppvz_sales_commission,
  );
  const legacyReward = num(raw.ppvzReward ?? raw.ppvz_reward);

  if (explicit > 0) return Math.round(explicit * 100) / 100;
  if (pct > 0 && retail > 0) {
    return Math.round(((retail * pct) / 100) * 100) / 100;
  }
  return Math.round(legacyReward * 100) / 100;
}

/**
 * Maps `POST /api/finance/v1/sales-reports/detailed` rows (camelCase) to the legacy
 * `reportDetailByPeriod` snake_case shape used by `wb_report_rows` / upsert.
 */
export function financeDetailedRowToLegacyShape(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const str = (v: unknown, fallback = '') =>
    v == null || v === '' ? fallback : String(v);
  const numStr = (v: unknown) => str(v ?? 0, '0');
  const dateOnly = (v: unknown) => {
    const s = str(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
  };

  const commissionRub = deriveWbCommissionRub(raw);

  return {
    rrd_id: str(raw.rrdId ?? raw.rrd_id),
    realizationreport_id: str(raw.reportId ?? raw.realizationreport_id),
    rr_dt: dateOnly(raw.rrDate ?? raw.rr_dt),
    supplier_oper_name: str(
      raw.sellerOperName ?? raw.supplier_oper_name ?? '',
    ),
    retail_price_withdisc_rub: numStr(
      raw.retailPriceWithDisc ?? raw.retail_price_withdisc_rub,
    ),
    ppvz_for_pay: numStr(raw.forPay ?? raw.ppvz_for_pay),
    ppvz_reward: numStr(commissionRub),
    delivery_rub: numStr(raw.deliveryService ?? raw.delivery_rub),
    storage_fee: numStr(raw.paidStorage ?? raw.storage_fee),
    penalty: numStr(raw.penalty),
    deduction: numStr(raw.deduction),
    acceptance: numStr(raw.paidAcceptance ?? raw.acceptance),
    rebill_logistic_cost: numStr(
      raw.rebillLogisticCost ?? raw.rebill_logistic_cost,
    ),
    nm_id: str(raw.nmId ?? raw.nm_id),
    sa_name: str(raw.vendorCode ?? raw.sa_name ?? ''),
  };
}
