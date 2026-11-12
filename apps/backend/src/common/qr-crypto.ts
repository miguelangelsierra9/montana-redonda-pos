import * as crypto from 'crypto';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateSecureRandomToken(byteLength = 20): string {
  const bytes = crypto.randomBytes(byteLength);
  let output = '';
  for (let i = 0; i < bytes.length; i++) {
    output += CROCKFORD_ALPHABET[bytes[i] % CROCKFORD_ALPHABET.length];
  }
  return output;
}

export function getSecretKey(): string {
  return process.env.QR_HMAC_SECRET || 'mrp_qr_hmac_cryptographic_secret_2026_do_not_share';
}

export function buildSignedQrPayload(ticketNumber: string): {
  qrPayload: string;
  qrTokenHash: string;
} {
  const randomToken = generateSecureRandomToken(20);
  const baseData = `MRP1.${ticketNumber}.${randomToken}`;
  const hmacSig = crypto
    .createHmac('sha256', getSecretKey())
    .update(baseData)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  const qrPayload = `${baseData}.${hmacSig}`;
  const qrTokenHash = sha256Hash(qrPayload);

  return { qrPayload, qrTokenHash };
}

export function verifySignedQrPayload(qrPayload: string): boolean {
  if (!qrPayload || typeof qrPayload !== 'string') return false;
  const parts = qrPayload.trim().split('.');
  if (parts.length !== 4 || parts[0] !== 'MRP1') return false;

  const [prefix, ticketNumber, randomToken, providedSig] = parts;
  const baseData = `${prefix}.${ticketNumber}.${randomToken}`;
  const expectedSig = crypto
    .createHmac('sha256', getSecretKey())
    .update(baseData)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();

  return providedSig.toUpperCase() === expectedSig;
}

export function sha256Hash(value: string): string {
  return crypto.createHash('sha256').update(value.trim()).digest('hex');
}

