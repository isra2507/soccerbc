import { useEffect, useState } from 'react'
import { ONGOING, formatCountdown } from '../lib/countdown.ts'
import { formatMatchDate } from '../lib/time.ts'

export function MatchCountdown({ nextMatchAt }: { nextMatchAt: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const countdown = formatCountdown(nextMatchAt ?? null, now)
  const matchOngoing = countdown === ONGOING

  return (
    <div className="match-strip" aria-live="polite">
      <span>{matchOngoing ? 'Game announcement' : 'Next soccer date'}</span>
      <strong>{formatMatchDate(nextMatchAt ?? null)}</strong>
      <em>{countdown}</em>
      {matchOngoing ? (
        <p className="match-announcement">
          The game is currently ongoing, and this table will stay displayed for 3 hours.
        </p>
      ) : null}
    </div>
  )
}
