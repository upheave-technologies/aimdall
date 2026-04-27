// =============================================================================
// Cost Tracking Module — Credential Encryption
// =============================================================================
// AES-256-GCM encryption/decryption for provider API key secrets stored in the
// cost_tracking_provider_credentials table. Uses Node.js built-in crypto only.
//
// Encrypted format (all components hex-encoded, joined by `:`)
//   hex(iv) : hex(authTag) : hex(ciphertext)
//
// The ENCRYPTION_KEY environment variable must be a 64-character hex string
// representing 32 raw bytes (256 bits). Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// =============================================================================

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;        // 96-bit IV — recommended for GCM
const AUTH_TAG_BYTES = 16;  // 128-bit authentication tag

// -----------------------------------------------------------------------------
// Private helpers
// -----------------------------------------------------------------------------

const readEncryptionKey = (): Buffer => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Provide a 64-character hex string (32 bytes).'
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ` +
      `Received ${hex.length} characters.`
    );
  }
  return Buffer.from(hex, 'hex');
};

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export const encrypt = (plaintext: string): string => {
  const key = readEncryptionKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    ciphertext.toString('hex'),
  ].join(':');
};

export const decrypt = (encrypted: string): string => {
  const key = readEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted format. Expected hex(iv):hex(authTag):hex(ciphertext).'
    );
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (iv.length !== IV_BYTES) {
    throw new Error(
      `Invalid IV length. Expected ${IV_BYTES} bytes, got ${iv.length}.`
    );
  }
  if (authTag.length !== AUTH_TAG_BYTES) {
    throw new Error(
      `Invalid auth tag length. Expected ${AUTH_TAG_BYTES} bytes, got ${authTag.length}.`
    );
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    throw new Error(
      'Decryption failed. The data may be corrupted or the key may be incorrect.'
    );
  }
};
