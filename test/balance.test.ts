import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import fc from 'fast-check'
import { SKILLS, TEAM_COUNTS, getActiveTeamKeys, type TeamCount } from '../shared/constants.ts'
import type { Player } from '../shared/schemas.ts'
import { balancePlayers, getSkillValue, groupByTeam } from '../api/rules/balance.ts'
import { makePlayer, makePlayers } from './helpers/factories.ts'

const sizes = (players: Player[], teamCount: TeamCount) => {
  const groups = groupByTeam(players, teamCount)
  return getActiveTeamKeys(teamCount).map((key) => groups[key].length)
}

const score = (players: Player[]) =>
  players.reduce((sum, player) => sum + getSkillValue(player.skill), 0)

describe('balancePlayers examples', () => {
  for (const teamCount of TEAM_COUNTS) {
    test(`splits 17 players across ${teamCount} teams evenly by count and skill`, () => {
      const balanced = balancePlayers(makePlayers(17), teamCount)
      const counts = sizes(balanced, teamCount)
      const groups = groupByTeam(balanced, teamCount)
      const scores = getActiveTeamKeys(teamCount).map((key) => score(groups[key]))

      assert.equal(balanced.length, 17)
      assert.equal(Math.max(...counts) - Math.min(...counts), 1)
      assert.ok(Math.max(...scores) - Math.min(...scores) <= 3, `scores ${scores}`)
    })
  }

  test('keeps manually moved players where staff put them', () => {
    const players = [
      makePlayer(1, { team: 'team2', manualTeam: true }),
      ...makePlayers(6).slice(1),
    ]
    const balanced = balancePlayers(players, 2)

    assert.equal(balanced[0]!.team, 'team2')
    assert.equal(balanced[0]!.manualTeam, true)
  })

  test('releases a manual move onto a team that is no longer in use', () => {
    const [released] = balancePlayers([makePlayer(1, { team: 'team4', manualTeam: true })], 2)

    assert.equal(released!.manualTeam, false)
    assert.ok(getActiveTeamKeys(2).includes(released!.team))
  })

  test('is stable when a skill changes: same input, same output', () => {
    const players = makePlayers(9)
    assert.deepEqual(balancePlayers(players, 3), balancePlayers(players, 3))
  })

  test('handles an empty roster', () => {
    assert.deepEqual(balancePlayers([], 4), [])
  })
})

const playerArb = fc
  .record({
    skill: fc.constantFrom(...SKILLS),
    locked: fc.boolean(),
    team: fc.constantFrom('team1', 'team2', 'team3', 'team4'),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ skill, locked, team, day }) => ({ skill, locked, team, day }))

const rosterArb = fc.array(playerArb, { maxLength: 40 }).map((rows) =>
  rows.map((row, index) =>
    makePlayer(index + 1, {
      skill: row.skill,
      team: row.team as Player['team'],
      manualTeam: row.locked,
      joinedAt: new Date(Date.UTC(2026, 0, row.day, 0, index)).toISOString(),
    }),
  ),
)

describe('balancePlayers properties', () => {
  const countArb = fc.constantFrom(...TEAM_COUNTS)

  test('every player ends up on exactly one active team, none lost or duplicated', () => {
    fc.assert(
      fc.property(rosterArb, countArb, (roster, teamCount) => {
        const balanced = balancePlayers(roster, teamCount)
        const active = getActiveTeamKeys(teamCount)

        assert.deepEqual(
          balanced.map((p) => p.id),
          roster.map((p) => p.id),
        )
        assert.ok(balanced.every((p) => active.includes(p.team)))
      }),
    )
  })

  test('without locks, team sizes differ by at most one', () => {
    fc.assert(
      fc.property(rosterArb, countArb, (roster, teamCount) => {
        const unlocked = roster.map((p) => ({ ...p, manualTeam: false }))
        const counts = sizes(balancePlayers(unlocked, teamCount), teamCount)

        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1)
      }),
    )
  })

  test('locked players on active teams never move', () => {
    fc.assert(
      fc.property(rosterArb, countArb, (roster, teamCount) => {
        const active = getActiveTeamKeys(teamCount)
        const balanced = balancePlayers(roster, teamCount)

        roster.forEach((original, index) => {
          if (original.manualTeam && active.includes(original.team)) {
            assert.equal(balanced[index]!.team, original.team)
            assert.equal(balanced[index]!.manualTeam, true)
          } else {
            assert.equal(balanced[index]!.manualTeam, false)
          }
        })
      }),
    )
  })

  test('is idempotent and deterministic', () => {
    fc.assert(
      fc.property(rosterArb, countArb, (roster, teamCount) => {
        const once = balancePlayers(roster, teamCount)
        assert.deepEqual(balancePlayers(once, teamCount), once)
        assert.deepEqual(balancePlayers(roster, teamCount), once)
      }),
    )
  })

  test('does not mutate its input', () => {
    fc.assert(
      fc.property(rosterArb, countArb, (roster, teamCount) => {
        const before = structuredClone(roster)
        balancePlayers(roster, teamCount)
        assert.deepEqual(roster, before)
      }),
    )
  })
})
