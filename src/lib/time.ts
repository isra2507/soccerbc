// Games are in Bellevue, so every time the site shows or accepts is Pacific time,
// whatever time zone the visitor's device is in. The server only deals in UTC.
export const CLUB_TIME_ZONE = 'America/Los_Angeles'

type Parts = Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>

const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function clubParts(time: number): Parts {
  const parts = Object.fromEntries(
    wallClock.formatToParts(new Date(time)).map((part) => [part.type, part.value]),
  )

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Milliseconds the club's clock is ahead of UTC at this instant (negative in the US). */
function clubOffset(time: number): number {
  const p = clubParts(time)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(time / 1000) * 1000
}

const pad = (value: number) => String(value).padStart(2, '0')

/** An instant as the value of a `<input type="datetime-local">`, in Pacific time. */
export function toClubInputValue(iso: string | null): string {
  const time = iso ? Date.parse(iso) : Number.NaN

  if (Number.isNaN(time)) {
    return ''
  }

  const p = clubParts(time)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/**
 * A Pacific wall-clock value from a `datetime-local` input as an ISO instant, or null
 * when empty or invalid. A time skipped by the spring clock change moves forward an
 * hour; a time repeated by the autumn change means the first (daylight) one.
 */
export function fromClubInputValue(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number]
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  const asDate = new Date(wall)

  // Reject impossible dates (month 13, 31 February, 25:00) rather than rolling them over.
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day ||
    asDate.getUTCHours() !== hour ||
    asDate.getUTCMinutes() !== minute
  ) {
    return null
  }

  // The offset in force just before and just after the requested time. They differ
  // only on the two clock-change days.
  const beforeChange = wall - clubOffset(wall - 12 * 3_600_000)
  const afterChange = wall - clubOffset(wall + 12 * 3_600_000)
  const real = [beforeChange, afterChange].filter(
    (time) => toClubInputValue(new Date(time).toISOString()) === value,
  )

  // Normal day: both agree. Repeated hour: both are real, take the first. Skipped
  // hour: neither is real, and the "before" offset lands an hour later on the clock.
  return new Date(real.length > 0 ? Math.min(...real) : beforeChange).toISOString()
}

const matchFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CLUB_TIME_ZONE,
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
})

export function formatMatchDate(iso: string | null): string {
  const time = iso ? Date.parse(iso) : Number.NaN
  return Number.isNaN(time) ? 'Date not set' : matchFormat.format(new Date(time))
}
