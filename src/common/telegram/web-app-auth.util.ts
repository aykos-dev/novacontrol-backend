import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validates Telegram Mini App / WebApp initData per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramWebAppData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): { ok: true; userId: string } | { ok: false; reason: string } {
  if (!initData?.trim()) {
    return { ok: false, reason: 'initData is empty' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'hash missing' };
  }

  const entries = [...params.entries()].filter(([k]) => k !== 'hash');
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const calculated = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();

  const hashBuf = Buffer.from(hash, 'hex');
  const calcBuf = Buffer.from(calculated);
  if (hashBuf.length !== calcBuf.length || !timingSafeEqual(hashBuf, calcBuf)) {
    return { ok: false, reason: 'invalid hash' };
  }

  const authDateRaw = params.get('auth_date');
  if (authDateRaw) {
    const authDate = parseInt(authDateRaw, 10);
    const age = Math.floor(Date.now() / 1000) - authDate;
    if (age > maxAgeSeconds || age < -120) {
      return { ok: false, reason: 'auth_date expired or invalid' };
    }
  }

  const userJson = params.get('user');
  if (!userJson) {
    return { ok: false, reason: 'user missing' };
  }

  try {
    const u = JSON.parse(userJson) as { id: number };
    if (typeof u.id !== 'number') {
      return { ok: false, reason: 'user.id invalid' };
    }
    return { ok: true, userId: String(u.id) };
  } catch {
    return { ok: false, reason: 'user JSON invalid' };
  }
}
