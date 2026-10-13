import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { GAME_HOLD_MS } from '../shared/constants.ts'
import { fromClubInputValue, formatMatchDate, toClubInputValue } from '../src/lib/time.ts'
import { ONGOING, REFRESHING, WAITING, formatCountdown } from '../src/lib/countdown.ts'

describe('Pacific time conversion', () => {
  test('a Friday 11:00 game in daylight time is 18:00 UTC', () => {
    assert.equal(fromClubInputValue('2026-10-16T11:00'), '2026-10-16T18:00:00.000Z')
    assert.equal(toClubInputValue('2026-10-16T18:00:00.000Z'), '2026-10-16T11:00')
  })

  test('the same wall-clock time in winter is one hour later in UTC', () => {
    assert.equal(fromClubInputValue('2026-12-04T11:00'), '2026-12-04T19:00:00.000Z')
    assert.equal(toClubInputValue('2026-12-04T19:00:00.000Z'), '2026-12-04T11:00')
  })

  test('spring forward: 2026-03-08, the skipped 02:30 becomes 03:30', () => {
    assert.equal(fromClubInputValue('2026-03-08T01:59'), '2026-03-08T09:59:00.000Z')
    assert.equal(fromClubInputValue('2026-03-08T02:30'), '2026-03-08T10:30:00.000Z')
    assert.equal(fromClubInputValue('2026-03-08T03:00'), '2026-03-08T10:00:00.000Z')
  })

  test('fall back: 2026-11-01, the repeated 01:30 means the first one', () => {
    assert.equal(fromClubInputValue('2026-11-01T01:30'), '2026-11-01T08:30:00.000Z')
    assert.equal(fromClubInputValue('2026-11-01T02:30'), '2026-11-01T10:30:00.000Z')
  })

  test('every minute round-trips across both clock-change weeks', () => {
    for (const start of [Date.UTC(2026, 2, 6), Date.UTC(2026, 9, 30)]) {
      for (let minutes = 0; minutes < 6 * 24 * 60; minutes += 15) {
        const iso = new Date(start + minutes * 60_000).toISOString()
        const local = toClubInputValue(iso)
        const back = fromClubInputValue(local)

        assert.equal(toClubInputValue(back), local, `${iso} -> ${local} -> ${back}`)
      }
    }
  })

  test('empty and invalid input is null, never a bogus date', () => {
    for (const value of ['', 'soon', '2026-10-16', '2026-13-01T10:00', '2026-02-31T10:00', '2026-10-16T25:00']) {
      assert.equal(fromClubInputValue(value), null, value)
    }
    assert.equal(toClubInputValue(null), '')
    assert.equal(toClubInputValue('garbage'), '')
  })

  test('is independent of the visitor time zone: it always reads Pacific', () => {
    assert.match(formatMatchDate('2026-10-16T18:00:00.000Z'), /Friday, October 16.*11:00\s?AM PDT/)
    assert.match(formatMatchDate('2026-12-04T19:00:00.000Z'), /Friday, December 4.*11:00\s?AM PST/)
    assert.equal(formatMatchDate(null), 'Date not set')
    assert.equal(formatMatchDate('nope'), 'Date not set')
  })
})

describe('formatCountdown', () => {
  const kickoff = Date.parse('2026-10-16T18:00:00.000Z')
  const iso = new Date(kickoff).toISOString()
  const SEC = 1000
  const MIN = 60 * SEC
  const HOUR = 60 * MIN

  test('counts down in days, hours, minutes and seconds', () => {
    const lead = (days: number, hours: number, minutes: number, seconds: number) =>
      kickoff - (days * 86400 * SEC + hours * HOUR + minutes * MIN + seconds * SEC)

    assert.equal(formatCountdown(iso, lead(2, 3, 4, 5)), '2d 3h 4m 5s')
    assert.equal(formatCountdown(iso, lead(0, 3, 4, 5)), '3h 4m 5s')
    assert.equal(formatCountdown(iso, lead(0, 0, 0, 1)), '0h 0m 1s')
  })

  test('switches to ongoing at kickoff and to refreshing after the hold', () => {
    assert.equal(formatCountdown(iso, kickoff - 1000), '0h 0m 1s')
    assert.equal(formatCountdown(iso, kickoff), ONGOING)
    assert.equal(formatCountdown(iso, kickoff + GAME_HOLD_MS - 1), ONGOING)
    assert.equal(formatCountdown(iso, kickoff + GAME_HOLD_MS), REFRESHING)
  })

  test('says it is waiting when there is no valid date', () => {
    assert.equal(formatCountdown(null, kickoff), WAITING)
    assert.equal(formatCountdown('garbage', kickoff), WAITING)
  })
})
