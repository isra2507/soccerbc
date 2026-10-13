import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gameSchema } from '../shared/schemas.ts'
import { convertLegacyState } from '../api/migrate/legacy.ts'

const oldPlayer = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  firstName: 'Ann',
  lastName: id,
  skill: 'beginner',
  team: 'penny',
  manualTeam: false,
  joinedAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '',
  updatedBy: '',
  ...extra,
})

describe('convertLegacyState', () => {
  test('converts a typical live blob into a valid game', () => {
    const { game, archived } = convertLegacyState({
      players: [oldPlayer('a', { skill: 'professional' }), oldPlayer('b'), oldPlayer('c')],
      match: {
        teamCount: 2,
        nextMatchAt: '2026-10-09T18:00:00.000Z',
        announcement: '  Bring water ',
        captains: { penny: 'a', withoutPenny: '' },
        updatedAt: '2026-10-05T00:00:00.000Z',
        updatedBy: 'Isra S',
        pastGames: [],
      },
    })

    gameSchema.parse(game)
    assert.equal(archived, null)
    assert.equal(game.players.length, 3)
    assert.equal(game.announcement, 'Bring water')
    assert.equal(game.updatedBy, 'Isra S')
    assert.ok(game.players.every((p) => ['team1', 'team2'].includes(p.team)))
    const captainTeam = game.players.find((p) => p.id === 'a')!.team
    assert.equal(game.captains[captainTeam], 'a')
  })

  test('keeps the previous game and returns it for the archive', () => {
    const { game, archived } = convertLegacyState({
      players: [],
      match: {
        pastGames: [
          {
            id: 'game-1',
            playedAt: '2026-10-02T18:00:00.000Z',
            archivedAt: '2026-10-02T21:00:00.000Z',
            teamCount: 2,
            captains: { penny: 'a' },
            teams: { penny: [oldPlayer('a')], withoutPenny: [oldPlayer('b', { team: 'penny' })] },
          },
        ],
      },
    })

    assert.equal(archived?.id, 'game-1')
    assert.equal(game.previousGame, archived)
    assert.equal(archived?.teams.team2[0]?.team, 'team2')
    assert.deepEqual(archived?.teams.team3, [])
  })

  test('renames the old team names (penny, withoutPenny) everywhere they appear', () => {
    const { game, archived } = convertLegacyState({
      players: [
        oldPlayer('a', { team: 'penny', manualTeam: true }),
        oldPlayer('b', { team: 'withoutPenny', manualTeam: true }),
      ],
      match: {
        captains: { penny: 'a', withoutPenny: 'b' },
        pastGames: [
          {
            playedAt: '2026-10-02T18:00:00.000Z',
            captains: { penny: 'x', withoutPenny: 'y', team3: 'z' },
            teams: { penny: [oldPlayer('x')], withoutPenny: [oldPlayer('y')], team3: [oldPlayer('z')] },
          },
        ],
      },
    })

    assert.equal(game.players.find((p) => p.id === 'a')?.team, 'team1')
    assert.equal(game.players.find((p) => p.id === 'b')?.team, 'team2')
    assert.deepEqual([game.captains.team1, game.captains.team2], ['a', 'b'])
    assert.deepEqual([archived?.captains.team1, archived?.captains.team2, archived?.captains.team3], ['x', 'y', 'z'])
    assert.deepEqual(archived?.teams.team1.map((p) => p.id), ['x'])
    assert.deepEqual(archived?.teams.team2.map((p) => p.id), ['y'])
    assert.deepEqual(archived?.teams.team3.map((p) => p.id), ['z'])
    assert.equal(JSON.stringify({ game, archived }).includes('enny'), false)
  })

  test('also accepts records that already use the new names', () => {
    const { game } = convertLegacyState({
      players: [oldPlayer('a', { team: 'team2', manualTeam: true })],
      match: { captains: { team2: 'a' } },
    })

    assert.equal(game.players[0]?.team, 'team2')
    assert.equal(game.captains.team2, 'a')
  })

  test('accepts the roster as a record keyed by id', () => {
    const { game } = convertLegacyState({ players: { x: oldPlayer('x'), y: oldPlayer('y') } })
    assert.deepEqual(game.players.map((p) => p.id).sort(), ['x', 'y'])
  })

  test('repairs or drops bad data instead of failing', () => {
    const { game } = convertLegacyState({
      players: [
        oldPlayer('ok', { skill: 'wizard', team: 'nowhere', firstName: ' Zed   Z ' }),
        oldPlayer('noname', { firstName: '' }),
        oldPlayer('ok'),
        'junk',
        null,
        oldPlayer('long', { firstName: 'x'.repeat(100) }),
      ],
      match: { teamCount: 9, nextMatchAt: 'not a date', announcement: 5 },
    })

    gameSchema.parse(game)
    assert.deepEqual(game.players.map((p) => p.id), ['ok', 'long'])
    assert.equal(game.players[0]!.skill, 'beginner')
    assert.equal(game.players[0]!.firstName, 'Zed Z')
    assert.equal(game.players[1]!.firstName.length, 40)
    assert.equal(game.teamCount, 2)
    assert.equal(game.nextMatchAt, null)
  })

  test('turns an empty or missing blob into an empty valid game', () => {
    for (const raw of [undefined, null, {}, 'oops', []]) {
      gameSchema.parse(convertLegacyState(raw).game)
    }
  })

  test('is deterministic', () => {
    const raw = { players: [oldPlayer('a'), oldPlayer('b')], match: { teamCount: 3 } }
    assert.deepEqual(convertLegacyState(raw), convertLegacyState(raw))
  })
})
