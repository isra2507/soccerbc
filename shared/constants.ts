export const TEAM_KEYS = ['team1', 'team2', 'team3', 'team4'] as const
export type TeamKey = (typeof TEAM_KEYS)[number]

// Team 1 plays without a pinnie (bib); the others wear one in the colour shown.
export const TEAM_LABELS: Record<TeamKey, string> = {
  team1: 'Team 1 (no pinnie)',
  team2: 'Team 2 (blue pinnie)',
  team3: 'Team 3 (red pinnie)',
  team4: 'Team 4 (yellow pinnie)',
}

export const TEAM_COUNTS = [2, 3, 4] as const
export type TeamCount = (typeof TEAM_COUNTS)[number]

export const SKILLS = ['beginner', 'intermediate', 'semi-pro', 'professional'] as const
export type Skill = (typeof SKILLS)[number]

export const SKILL_POINTS: Record<Skill, number> = {
  beginner: 1,
  intermediate: 2,
  'semi-pro': 3,
  professional: 4,
}

// Order in which a team's captain is preferred (first is most preferred).
export const CAPTAIN_SKILL_PRIORITY: readonly Skill[] = [
  'semi-pro',
  'professional',
  'intermediate',
  'beginner',
]

export const MAX_NAME_LENGTH = 40
export const MAX_PLAYERS = 120
export const MAX_ANNOUNCEMENT_LENGTH = 1000

const HOUR_MS = 60 * 60 * 1000
// How long the board stays up after kickoff before the game is archived.
export const GAME_HOLD_MS = 3 * HOUR_MS
// How long the previous game's teams stay visible after it was played.
export const PREVIOUS_GAME_VISIBLE_MS = 7 * 24 * HOUR_MS

export const DEFAULT_TEAM_COUNT: TeamCount = 2

export function getActiveTeamKeys(teamCount: TeamCount): readonly TeamKey[] {
  return TEAM_KEYS.slice(0, teamCount)
}
