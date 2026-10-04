import assert from 'node:assert/strict'
import test from 'node:test'
import { getActiveAnnouncement } from '../src/announcements.js'

const start = Date.parse('2026-10-09T18:00:00Z')
const match = { nextMatchAt: new Date(start).toISOString(), announcement: ' Bring water! ' }

test('announcements appear before kickoff and during the table display', () => {
  assert.equal(getActiveAnnouncement(match, start - 1000), 'Bring water!')
  assert.equal(getActiveAnnouncement(match, start + 3 * 3600000 - 1), 'Bring water!')
})

test('announcements disappear at the table expiry time', () => {
  assert.equal(getActiveAnnouncement(match, start + 3 * 3600000), '')
})

test('unscheduled, invalid, and removed announcements are hidden', () => {
  for (const nextMatchAt of ['', 'invalid']) {
    assert.equal(getActiveAnnouncement({ ...match, nextMatchAt }, start), '')
  }
  assert.equal(getActiveAnnouncement({ ...match, announcement: '' }, start), '')
})
