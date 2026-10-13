export type Config = {
  /** Browser origins allowed by CORS. Empty means no cross-origin access. */
  allowedOrigins: string[]
  /** `pbkdf2-sha256$iterations$saltBase64$hashBase64` (see `npm run hash-password`). */
  staffPasswordHash: string
  /** At least 32 characters of randomness; signs staff tokens. Shorter counts as not configured. */
  staffAuthSecret: string
  /**
   * When set, every request must carry this value in `x-origin-verify`, which CloudFront adds.
   * That stops people calling the API address directly and skipping CloudFront.
   */
  originSecret: string
  /** True when CloudFront is in front: the visitor's address is then read from `x-forwarded-for`. */
  behindCloudFront: boolean
}

export const MIN_SECRET_LENGTH = 32

export function configFromEnv(env: Record<string, string | undefined>): Config {
  const secret = env.STAFF_AUTH_SECRET ?? ''

  if (secret && secret.length < MIN_SECRET_LENGTH) {
    console.error(`STAFF_AUTH_SECRET is shorter than ${MIN_SECRET_LENGTH} characters; staff login is disabled.`)
  }

  return {
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    staffPasswordHash: env.STAFF_PASSWORD_HASH ?? '',
    staffAuthSecret: secret.length >= MIN_SECRET_LENGTH ? secret : '',
    originSecret: env.ORIGIN_VERIFY_SECRET ?? '',
    behindCloudFront: env.BEHIND_CLOUDFRONT === 'true',
  }
}
