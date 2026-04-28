import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Builds a 32-byte key for AES-256-CBC:
 * - If `secret` is exactly 64 hex characters, use those bytes as the key.
 * - Otherwise derive 32 bytes with SHA-256(secret UTF-8) (passphrases, short values).
 */
function resolveKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  return createHash('sha256').update(trimmed, 'utf8').digest();
}

/**
 * Encrypts a plaintext string using AES-256-CBC.
 *
 * @param text - The plaintext to encrypt.
 * @param key  - 64 hex chars (32 raw bytes), or any string (hashed with SHA-256 to 32 bytes).
 * @returns The encrypted payload as `iv:ciphertext`, both hex-encoded.
 */
export function encrypt(text: string, key: string): string {
  const keyBuffer = resolveKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a payload previously produced by {@link encrypt}.
 *
 * @param encrypted - The `iv:ciphertext` string (hex-encoded).
 * @param key       - Same value as used for {@link encrypt}.
 * @returns The original plaintext.
 */
export function decrypt(encrypted: string, key: string): string {
  const [ivHex, encryptedText] = encrypted.split(':');
  const keyBuffer = resolveKey(key);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
