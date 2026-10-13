import {
  SKILL_POINTS,
  TEAM_KEYS,
  getActiveTeamKeys,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type { Player } from '../../shared/schemas.ts'

/** Drives the colour of each team's table in the stylesheet. */
export const TEAM_COLORS: Record<TeamKey, string> = {
  team1: 'none',
  team2: 'blue',
  team3: 'red',
  team4: 'yellow',
}

export type TeamPlayers = Record<TeamKey, Player[]>

/** Splits the server's roster by team for display. The server decides who is where. */
export function groupByTeam(players: readonly Player[], teamCount: TeamCount): TeamPlayers {
  const groups = Object.fromEntries(TEAM_KEYS.map((key) => [key, [] as Player[]])) as TeamPlayers
  const active = getActiveTeamKeys(teamCount)

  for (const player of players) {
    if (active.includes(player.team)) {
      groups[player.team].push(player)
    }
  }

  return groups
}

export const playerName = (player: { firstName: string; lastName: string }) =>
  `${player.firstName} ${player.lastName}`

export const teamSkillScore = (players: readonly Pick<Player, 'skill'>[]) =>
  players.reduce((total, player) => total + SKILL_POINTS[player.skill], 0)
