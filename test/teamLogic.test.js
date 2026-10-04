import assert from 'node:assert/strict'
import test from 'node:test'
import {
  balanceTeamAssignments,
  getActiveTeamKeys,
  getSkillValue,
  groupPlayersByTeam,
  normalizeTeamCount,
} from '../src/teamLogic.js'

const skills = ['professional', 'semi-pro', 'intermediate', 'beginner']

function makePlayers(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    firstName: `Player${index + 1}`,
    lastName: 'Test',
    skill: skills[index % skills.length],
    team: 'penny',
    joinedAt: new Date(2026, 0, index + 1).toISOString(),
  }))
}

for (const teamCount of [2, 3, 4]) {
  test(`balances names and skill levels across ${teamCount} teams`, () => {
    const players = makePlayers(17)
    const balanced = balanceTeamAssignments(players, teamCount)
    const groups = groupPlayersByTeam(balanced, teamCount)
    const counts = Object.values(groups).map((team) => team.length)

    assert.deepEqual(
      balanced.map((player) => player.id),
      players.map((player) => player.id),
    )
    assert.deepEqual(
      balanced.map((player) => `${player.firstName} ${player.lastName}`),
      players.map((player) => `${player.firstName} ${player.lastName}`),
    )
    assert.equal(Math.max(...counts) - Math.min(...counts), 1)
    assert.deepEqual(Object.keys(groups), getActiveTeamKeys(teamCount))
  })
}

test('changing from two teams to four keeps every player and recalculates teams', () => {
  const twoTeams = balanceTeamAssignments(makePlayers(12), 2)
  const fourTeams = balanceTeamAssignments(twoTeams, 4)

  assert.deepEqual(
    new Set(fourTeams.map((player) => player.id)),
    new Set(twoTeams.map((player) => player.id)),
  )
  assert.equal(new Set(fourTeams.map((player) => player.team)).size, 4)
})

test('a skill edit causes a deterministic rebalance', () => {
  const players = balanceTeamAssignments(makePlayers(8), 2)
  const edited = players.map((player, index) =>
    index === 7 ? { ...player, skill: 'professional' } : player,
  )
  const firstResult = balanceTeamAssignments(edited, 2)
  const secondResult = balanceTeamAssignments(edited, 2)
  const scores = Object.values(groupPlayersByTeam(firstResult, 2)).map((team) =>
    team.reduce((score, player) => score + getSkillValue(player.skill), 0),
  )

  assert.deepEqual(firstResult, secondResult)
  assert.ok(Math.abs(scores[0] - scores[1]) <= 1)
})

test('invalid team counts fall back to two teams', () => {
  assert.equal(normalizeTeamCount(1), 2)
  assert.equal(normalizeTeamCount('3'), 3)
  assert.equal(normalizeTeamCount(5), 2)
})


for (const teamCount of [2, 3, 4]) {
  test(`manual moves survive balancing and new signups with ${teamCount} teams`, () => {
    for (const target of getActiveTeamKeys(teamCount)) {
      const players = makePlayers(12)
      players[0] = { ...players[0], team: target, manualTeam: true }
      const balanced = balanceTeamAssignments(players, teamCount)
      assert.equal(balanced[0].team, target)
      const withSignup = balanceTeamAssignments([...balanced, ...makePlayers(1).map((p) => ({ ...p, id: 'new' }))], teamCount)
      assert.equal(withSignup[0].team, target)
      assert.equal(withSignup[0].manualTeam, true)
    }
  })
}

test('a manual assignment to a disabled team is released', () => {
  const players = makePlayers(4)
  players[0] = { ...players[0], team: 'team4', manualTeam: true }
  const balanced = balanceTeamAssignments(players, 3)
  assert.ok(getActiveTeamKeys(3).includes(balanced[0].team))
  assert.equal(balanced[0].manualTeam, false)
})
