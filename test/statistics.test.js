import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeStatistics, matchResult } from '../src/statistics.js'

test('statistics default to private with no recorded match', () => {
  const stats = normalizeStatistics()
  assert.equal(stats.public, false)
  assert.deepEqual(stats.players, [])
  assert.equal(matchResult(stats.lastMatch), 'No match result recorded.')
})
test('statistics keep valid counts and reject negative, fractional or invalid numbers', () => {
  const stats = normalizeStatistics({ public: true, players: [
    { name: '  Alex ', goals: '3', assists: 2 },
    { name: 'Sam', goals: -1, assists: 1.5 },
    { name: 'Pat', goals: Infinity, assists: 'invalid' }, { name: ' ' },
  ] })
  assert.equal(stats.public, true)
  assert.deepEqual(stats.players.map(({ name, goals, assists }) => ({ name, goals, assists })), [
    { name: 'Alex', goals: 3, assists: 2 }, { name: 'Sam', goals: 0, assists: 0 }, { name: 'Pat', goals: 0, assists: 0 },
  ])
})
test('last match reports winners, goal margins, draws, and zero scores', () => {
  assert.equal(matchResult({ recorded: true, penny: 4, noPenny: 1 }), 'Penny won by 3 goals')
  assert.equal(matchResult({ recorded: true, penny: 0, noPenny: 1 }), 'No penny won by 1 goal')
  assert.equal(matchResult({ recorded: true, penny: 0, noPenny: 0 }), 'Draw')
})
