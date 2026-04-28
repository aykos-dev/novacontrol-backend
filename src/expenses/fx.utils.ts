/** KGS equivalent from USD and KGS-per-USD rate, persisted with 2 decimal places. */
export function roundKgsAmountUsdTimesRate(amountUsd: number, kgsPerUsd: number): string {
  const v = Math.round(amountUsd * kgsPerUsd * 100) / 100;
  return v.toFixed(2);
}
