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
