import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { GAME_HOLD_MS, PREVIOUS_GAME_VISIBLE_MS } from '../shared/constants.ts'
import {
  AUTOMATIC_RESET_ACTOR,
  emptyGame,
  isOver,
  rollover,
  snapshotGame,
  toPreviousGame,
  toState,
} from '../api/rules/lifecycle.ts'
import { DAY, HOUR, makeGame, makePlayer } from './helpers/factories.ts'

const KICKOFF = Date.parse('2026-10-09T18:00:00Z')
const iso = (time: number) => new Date(time).toISOString()

const playedGame = () =>
  makeGame({
    nextMatchAt: iso(KICKOFF),
    announcement: 'Bring water',
    teamCount: 3,
    players: [
      makePlayer(1, { team: 'team1' }),
      makePlayer(2, { team: 'team2' }),
      makePlayer(3, { team: 'team3' }),
    ],
    captains: { team1: 'p1', team2: 'p2', team3: 'p3', team4: '' },
  })

describe('isOver', () => {
  test('is false before kickoff and until exactly kickoff + hold', () => {
    const game = playedGame()

    assert.equal(isOver(game, KICKOFF - 1), false)
    assert.equal(isOver(game, KICKOFF), false)
    assert.equal(isOver(game, KICKOFF + GAME_HOLD_MS - 1), false)
    assert.equal(isOver(game, KICKOFF + GAME_HOLD_MS), true)
  })

  test('is false with no date or an unparseable date', () => {
    assert.equal(isOver(emptyGame(), KICKOFF), false)
    assert.equal(isOver(makeGame({ nextMatchAt: 'garbage' }), KICKOFF), false)
  })
})

describe('rollover', () => {
  test('leaves a live game untouched', () => {
    const game = playedGame()
    const result = rollover(game, KICKOFF + HOUR)

    assert.equal(result.game, game)
    assert.equal(result.archived, null)
  })

  test('archives teams and starts an empty board that keeps the team count', () => {
    const now = KICKOFF + GAME_HOLD_MS
    const { game, archived } = rollover(playedGame(), now)

    assert.equal(archived?.id, `game-${KICKOFF}`)
    assert.deepEqual(archived?.teams.team1.map((p) => p.id), ['p1'])
    assert.deepEqual(archived?.teams.team3.map((p) => p.id), ['p3'])
    assert.equal(archived?.captains.team2, 'p2')
    assert.equal(archived?.archivedAt, iso(now))

    assert.deepEqual(game.players, [])
    assert.equal(game.nextMatchAt, null)
    assert.equal(game.announcement, '')
    assert.equal(game.teamCount, 3)
    assert.equal(game.updatedBy, AUTOMATIC_RESET_ACTOR)
    assert.equal(game.previousGame, archived)
  })

  test('a game nobody signed up for is not archived and keeps the older previous game', () => {
    const older = snapshotGame(playedGame(), KICKOFF)!
    const empty = makeGame({ nextMatchAt: iso(KICKOFF + 7 * DAY), previousGame: older })
    const { game, archived } = rollover(empty, KICKOFF + 7 * DAY + GAME_HOLD_MS)

    assert.equal(archived, null)
    assert.equal(game.previousGame, older)
  })

  test('stamps the archive with when the game ended, not when it was noticed', () => {
    const endedAt = iso(KICKOFF + GAME_HOLD_MS)
    const promptly = rollover(playedGame(), KICKOFF + GAME_HOLD_MS)
    const muchLater = rollover(playedGame(), KICKOFF + GAME_HOLD_MS + 30 * DAY)

    assert.equal(promptly.archived?.archivedAt, endedAt)
    assert.equal(muchLater.archived?.archivedAt, endedAt)
    assert.deepEqual(promptly.archived, muchLater.archived)
  })

  test('does not mutate the game it was given', () => {
    const game = playedGame()
    const before = structuredClone(game)
    rollover(game, KICKOFF + GAME_HOLD_MS)

    assert.deepEqual(game, before)
  })

  test('applying it twice changes nothing the second time (idempotent)', () => {
    const once = rollover(playedGame(), KICKOFF + GAME_HOLD_MS).game
    const twice = rollover(once, KICKOFF + GAME_HOLD_MS + HOUR)

    assert.equal(twice.game, once)
    assert.equal(twice.archived, null)
  })
})

describe('toPreviousGame', () => {
  test('is empty while the first game is still live', () => {
    assert.deepEqual(toPreviousGame(playedGame(), KICKOFF + HOUR), { game: null })
  })

  test('shows an over game even before anyone has saved the archive', () => {
    const { game } = toPreviousGame(playedGame(), KICKOFF + GAME_HOLD_MS)

    assert.equal(game?.id, `game-${KICKOFF}`)
    assert.equal(game?.teams.team1.length, 1)
  })

  test('hides the previous game after the visibility window', () => {
    const rolled = rollover(playedGame(), KICKOFF + GAME_HOLD_MS)
    const archivedAt = Date.parse(rolled.archived!.archivedAt)

    assert.ok(toPreviousGame(rolled.game, archivedAt + PREVIOUS_GAME_VISIBLE_MS).game)
    assert.equal(toPreviousGame(rolled.game, archivedAt + PREVIOUS_GAME_VISIBLE_MS + 1).game, null)
  })
})

describe('toState (what readers see, with no write)', () => {
  test('shows the live board before the game is over', () => {
    const state = toState(playedGame(), KICKOFF + HOUR)

    assert.equal(state.players.length, 3)
    assert.equal(state.match.announcement, 'Bring water')
    assert.equal('previousGame' in state, false)
  })

  test('shows an over game as already archived, and the roster as empty', () => {
    const state = toState(playedGame(), KICKOFF + GAME_HOLD_MS)

    assert.deepEqual(state.players, [])
    assert.equal(state.match.nextMatchAt, null)
    assert.equal(state.match.announcement, '')
  })

  test('does not leak the staff-only captain flags', () => {
    const state = toState(playedGame(), KICKOFF)

    assert.equal('manualCaptains' in state.match, false)
  })
})
