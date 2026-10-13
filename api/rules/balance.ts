import {
  SKILL_POINTS,
  getActiveTeamKeys,
  type Skill,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type { Player } from '../../shared/schemas.ts'

export const getSkillValue = (skill: Skill): number => SKILL_POINTS[skill] ?? SKILL_POINTS.beginner

export const compareJoinOrder = (a: Player, b: Player): number =>
  (a.joinedAt || a.id).localeCompare(b.joinedAt || b.id)

/**
 * Assigns every player to a team.
 *
 * Players with `manualTeam` on an active team stay where staff put them. The rest
 * are placed strongest-first onto the team with the fewest players, then the lowest
 * skill total, so team sizes differ by at most one (ignoring locked players).
 * Pure and deterministic: the same input always gives the same output.
 */
export function balancePlayers(players: readonly Player[], teamCount: TeamCount): Player[] {
  const teamKeys = getActiveTeamKeys(teamCount)
  const totals = new Map<TeamKey, { count: number; score: number }>(
    teamKeys.map((key) => [key, { count: 0, score: 0 }]),
  )
  const assignments = new Map<string, TeamKey>()

  const place = (player: Player, team: TeamKey) => {
    const total = totals.get(team)!
    total.count += 1
    total.score += getSkillValue(player.skill)
    assignments.set(player.id, team)
  }

  const isLocked = (player: Player) => player.manualTeam && teamKeys.includes(player.team)
  players.filter(isLocked).forEach((player) => place(player, player.team))

  const unlocked = players
    .filter((player) => !isLocked(player))
    .sort(
      (a, b) =>
        getSkillValue(b.skill) - getSkillValue(a.skill) || compareJoinOrder(a, b),
    )

  for (const player of unlocked) {
    const lowestCount = Math.min(...teamKeys.map((key) => totals.get(key)!.count))
    const target = teamKeys
      .filter((key) => totals.get(key)!.count === lowestCount)
      .sort(
        (a, b) =>
          totals.get(a)!.score - totals.get(b)!.score ||
          teamKeys.indexOf(a) - teamKeys.indexOf(b),
      )[0]!
    place(player, target)
  }

  return players.map((player) => ({
    ...player,
    team: assignments.get(player.id) ?? teamKeys[0]!,
    manualTeam: isLocked(player),
  }))
}

export function groupByTeam(
  players: readonly Player[],
  teamCount: TeamCount,
): Record<TeamKey, Player[]> {
  const groups: Record<TeamKey, Player[]> = { team1: [], team2: [], team3: [], team4: [] }
  const active = getActiveTeamKeys(teamCount)

  for (const player of players) {
    if (active.includes(player.team)) {
      groups[player.team].push(player)
    }
  }

  return groups
}
