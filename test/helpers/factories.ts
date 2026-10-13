import type { Skill, TeamKey } from '../../shared/constants.ts'
import type { Game, Player } from '../../shared/schemas.ts'
import { emptyGame } from '../../api/rules/lifecycle.ts'

export const HOUR = 60 * 60 * 1000
export const DAY = 24 * HOUR

export const SKILL_CYCLE: Skill[] = ['professional', 'semi-pro', 'intermediate', 'beginner']

export function makePlayer(index: number, overrides: Partial<Player> = {}): Player {
  return {
    id: `p${index}`,
    firstName: `Player${index}`,
    lastName: 'Test',
    skill: SKILL_CYCLE[index % SKILL_CYCLE.length]!,
    team: 'team1' as TeamKey,
    manualTeam: false,
    joinedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    updatedAt: '',
    updatedBy: '',
    ...overrides,
  }
}

export const makePlayers = (count: number): Player[] =>
  Array.from({ length: count }, (_, index) => makePlayer(index + 1))

export function makeGame(overrides: Partial<Game> = {}): Game {
  return { ...emptyGame(), ...overrides }
}
