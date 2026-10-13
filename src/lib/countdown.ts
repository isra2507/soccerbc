import { GAME_HOLD_MS } from '../../shared/constants.ts'

export const WAITING = 'Waiting for the next soccer date'
export const ONGOING = 'Game currently ongoing'
export const REFRESHING = 'Refreshing the board'

/** The text under the "next soccer date": a countdown, or what is happening instead. */
export function formatCountdown(nextMatchAt: string | null, now: number): string {
  const target = nextMatchAt ? Date.parse(nextMatchAt) : Number.NaN

  if (Number.isNaN(target)) {
    return WAITING
  }

  const difference = target - now

  if (difference <= -GAME_HOLD_MS) {
    return REFRESHING
  }

  if (difference <= 0) {
    return ONGOING
  }

  const totalSeconds = Math.floor(difference / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return days > 0
    ? `${days}d ${hours}h ${minutes}m ${seconds}s`
    : `${hours}h ${minutes}m ${seconds}s`
}
