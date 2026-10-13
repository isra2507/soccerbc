import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { emptyCaptains, noManualCaptains, resolveCaptains } from '../api/rules/captains.ts'
import { makePlayer } from './helpers/factories.ts'

const resolve = (
  players: ReturnType<typeof makePlayer>[],
  current = emptyCaptains(),
  manual = noManualCaptains(),
  teamCount: 2 | 3 | 4 = 2,
) => resolveCaptains(players, current, manual, teamCount)

describe('resolveCaptains', () => {
  test('prefers semi-pro, then professional, then intermediate, then beginner', () => {
    const players = [
      makePlayer(1, { skill: 'beginner' }),
      makePlayer(2, { skill: 'professional' }),
      makePlayer(3, { skill: 'semi-pro' }),
      makePlayer(4, { skill: 'intermediate' }),
    ]

    assert.equal(resolve(players).captains.team1, 'p3')
    assert.equal(resolve(players.filter((p) => p.id !== 'p3')).captains.team1, 'p2')
  })

  test('breaks ties by earliest sign-up', () => {
    const players = [makePlayer(5, { skill: 'beginner' }), makePlayer(2, { skill: 'beginner' })]
    assert.equal(resolve(players).captains.team1, 'p2')
  })

  test('keeps the current captain when equally preferred, so it does not flip-flop', () => {
    const players = [makePlayer(1, { skill: 'beginner' }), makePlayer(2, { skill: 'beginner' })]
    const current = { ...emptyCaptains(), team1: 'p2' }

    assert.equal(resolve(players, current).captains.team1, 'p2')
  })

  test('replaces the current captain when a more preferred player joins', () => {
    const players = [makePlayer(1, { skill: 'beginner' }), makePlayer(2, { skill: 'semi-pro' })]
    const current = { ...emptyCaptains(), team1: 'p1' }

    assert.equal(resolve(players, current).captains.team1, 'p2')
  })

  test('keeps a captain chosen by staff even if someone more skilled is on the team', () => {
    const players = [makePlayer(1, { skill: 'beginner' }), makePlayer(2, { skill: 'semi-pro' })]
    const current = { ...emptyCaptains(), team1: 'p1' }
    const manual = { ...noManualCaptains(), team1: true }
    const result = resolve(players, current, manual)

    assert.equal(result.captains.team1, 'p1')
    assert.equal(result.manualCaptains.team1, true)
  })

  test('drops a staff choice once that player leaves the team', () => {
    const players = [makePlayer(2, { skill: 'semi-pro' })]
    const current = { ...emptyCaptains(), team1: 'p1' }
    const manual = { ...noManualCaptains(), team1: true }
    const result = resolve(players, current, manual)

    assert.equal(result.captains.team1, 'p2')
    assert.equal(result.manualCaptains.team1, false)
  })

  test('empty and inactive teams have no captain, and the captain is always on the team', () => {
    const players = [
      makePlayer(1, { team: 'team1' }),
      makePlayer(2, { team: 'team4' }),
    ]
    const result = resolve(players, { ...emptyCaptains(), team2: 'ghost' })

    assert.equal(result.captains.team2, '')
    assert.equal(result.captains.team4, '')
    assert.equal(result.captains.team1, 'p1')
  })
})
