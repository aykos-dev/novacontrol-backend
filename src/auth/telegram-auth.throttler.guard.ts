import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Parses `user.id` from raw initData for rate-limit keys only — not cryptographic
 * verification (AuthService validates the signature).
 */
function parseInitDataTelegramUserId(initData: unknown): string | null {
  if (typeof initData !== 'string' || !initData.trim()) return null;
  try {
    const userJson = new URLSearchParams(initData.trim()).get('user');
    if (!userJson) return null;
    const u = JSON.parse(userJson) as { id?: unknown };
    if (typeof u.id === 'number' && Number.isFinite(u.id))
      return String(u.id);
    return null;
  } catch {
    return null;
  }
}

/** Buckets by IP + Telegram user when initData parses, else IP-only (malformed spam). */
@Injectable()
export class TelegramAuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip =
      typeof req.ip === 'string' && req.ip.trim() ? req.ip.trim() : 'unknown';
    const body = req.body as { initData?: unknown } | undefined;
    const tgId = parseInitDataTelegramUserId(body?.initData);
    return tgId ? `${ip}:tg:${tgId}` : ip;
  }
}
