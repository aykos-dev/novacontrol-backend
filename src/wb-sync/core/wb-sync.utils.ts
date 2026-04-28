export function formatWbDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse WB `X-Ratelimit-Retry` header value in seconds (wait duration before retry). */
export function parseXRateLimitRetrySeconds(headers: unknown): number | null {
  if (!headers || typeof headers !== 'object') return null;
  const h = headers as Record<string, unknown> & {
    get?: (name: string) => unknown;
  };
  const raw =
    h['x-ratelimit-retry'] ??
    h['X-Ratelimit-Retry'] ??
    h.get?.('x-ratelimit-retry');
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (s == null || s === '') return null;
  const n = parseInt(String(s), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
