import {
  CAPTAIN_SKILL_PRIORITY,
  TEAM_KEYS,
  getActiveTeamKeys,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type { Captains, Player } from '../../shared/schemas.ts'
import { compareJoinOrder } from './balance.ts'

export type ManualCaptains = Record<TeamKey, boolean>

export const emptyCaptains = (): Captains => ({
  team1: '',
  team2: '',
  team3: '',
  team4: '',
})

export const noManualCaptains = (): ManualCaptains => ({
  team1: false,
  team2: false,
  team3: false,
  team4: false,
})

const priority = (player: Player): number => {
  const index = CAPTAIN_SKILL_PRIORITY.indexOf(player.skill)
  return index === -1 ? CAPTAIN_SKILL_PRIORITY.length : index
}

/**
 * Picks each active team's captain.
 *
 * - A captain chosen by staff stays while that player is still on the team.
 * - Otherwise the most preferred skill wins (earliest sign-up breaks ties), and the
 *   current captain is kept when they are as preferred as the best candidate, so
 *   captains do not change every time someone joins.
 * - Teams that are empty or inactive have no captain.
 */
export function resolveCaptains(
  players: readonly Player[],
  current: Captains,
  manual: ManualCaptains,
  teamCount: TeamCount,
): { captains: Captains; manualCaptains: ManualCaptains } {
  const captains = emptyCaptains()
  const manualCaptains = noManualCaptains()

  for (const team of getActiveTeamKeys(teamCount)) {
    const teamPlayers = players.filter((player) => player.team === team)
    const currentCaptain = teamPlayers.find((player) => player.id === current[team])

    if (currentCaptain && manual[team]) {
      captains[team] = currentCaptain.id
      manualCaptains[team] = true
      continue
    }

    const best = [...teamPlayers].sort(
      (a, b) => priority(a) - priority(b) || compareJoinOrder(a, b),
    )[0]

    if (!best) {
      continue
    }

    captains[team] =
      currentCaptain && priority(currentCaptain) === priority(best) ? currentCaptain.id : best.id
  }

  return { captains, manualCaptains }
}

export const isTeamKey = (value: string): value is TeamKey =>
  (TEAM_KEYS as readonly string[]).includes(value)
