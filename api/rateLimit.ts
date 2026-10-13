import type { Store } from './store.ts'

export const RATE_LIMITS = {
  auth: { limit: 10, windowSeconds: 15 * 60 },
  signup: { limit: 30, windowSeconds: 10 * 60 },
} as const

export type LimitScope = keyof typeof RATE_LIMITS

/**
 * Fixed-window counter per client IP. Fails open: if the counter is unavailable
 * the request is allowed, so an outage here cannot take sign-ups or login down.
 */
export async function exceedsRateLimit(
  store: Store,
  scope: LimitScope,
  ip: string,
  nowMs: number,
): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[scope]
  const windowIndex = Math.floor(nowMs / 1000 / windowSeconds)

  try {
    const hits = await store.incrementCounter(
      `ratelimit#${scope}#${ip}#${windowIndex}`,
      (windowIndex + 2) * windowSeconds,
    )
    return hits > limit
  } catch (error) {
    console.error('Rate limit check failed; allowing request.', error)
    return false
  }
}
