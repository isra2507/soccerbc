import { createHmac, pbkdf2Sync, timingSafeEqual } from 'node:crypto'

export const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60
const MIN_ITERATIONS = 100_000

export type StaffClaims = { role: 'staff'; name: string; exp: number }

type PasswordRecord = { iterations: number; salt: Buffer; hash: Buffer }

export function parsePasswordRecord(record: string): PasswordRecord | null {
  const [algorithm, iterationsValue, saltValue, hashValue] = record.split('$')
  const iterations = Number(iterationsValue)

  if (
    algorithm !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    !saltValue ||
    !hashValue
  ) {
    return null
  }

  return {
    iterations,
    salt: Buffer.from(saltValue, 'base64'),
    hash: Buffer.from(hashValue, 'base64'),
  }
}

export function passwordMatches(password: string, record: PasswordRecord): boolean {
  const candidate = pbkdf2Sync(password, record.salt, record.iterations, record.hash.length, 'sha256')
  return candidate.length === record.hash.length && timingSafeEqual(candidate, record.hash)
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url')

export function createToken(name: string, secret: string, nowSeconds: number): string {
  const claims: StaffClaims = { role: 'staff', name, exp: nowSeconds + TOKEN_LIFETIME_SECONDS }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

/** Returns the claims for a genuine, unexpired staff token, otherwise null. */
export function verifyToken(token: string, secret: string, nowSeconds: number): StaffClaims | null {
  const [payload, signature, ...extra] = token.split('.')

  if (!secret || !payload || !signature || extra.length > 0) {
    return null
  }

  const expected = Buffer.from(sign(payload, secret))
  const provided = Buffer.from(signature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<StaffClaims>

    return claims.role === 'staff' &&
      typeof claims.name === 'string' &&
      typeof claims.exp === 'number' &&
      claims.exp > nowSeconds
      ? (claims as StaffClaims)
      : null
  } catch {
    return null
  }
}
