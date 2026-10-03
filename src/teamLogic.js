export const TEAM_KEYS = ['penny', 'withoutPenny', 'team3', 'team4']
export const TEAM_COUNT_OPTIONS = [2, 3, 4]
const CAPTAIN_SKILL_PRIORITY = ['semi-pro', 'professional', 'intermediate', 'beginner']

export const SKILL_POINTS = {
  beginner: 1,
  intermediate: 2,
  'semi-pro': 3,
  professional: 4,
}

export function normalizeTeamCount(value) {
  const count = Number(value)
  return TEAM_COUNT_OPTIONS.includes(count) ? count : 2
}

export function getActiveTeamKeys(teamCount = 2) {
  return TEAM_KEYS.slice(0, normalizeTeamCount(teamCount))
}

export function getSkillValue(skill) {
  return SKILL_POINTS[skill] ?? SKILL_POINTS.beginner
}

export function sanitizeTeam(team) {
  return TEAM_KEYS.includes(team) ? team : TEAM_KEYS[0]
}

export function normalizeCaptains(captains) {
  return Object.fromEntries(
    TEAM_KEYS.map((teamKey) => [teamKey, String(captains?.[teamKey] || '')]),
  )
}

export function balanceTeamAssignments(players = [], teamCount = 2) {
  const teamKeys = getActiveTeamKeys(teamCount)
  const teamState = Object.fromEntries(
    teamKeys.map((teamKey) => [teamKey, { count: 0, score: 0 }]),
  )
  const assignments = new Map()
  const sortedPlayers = [...players].sort((a, b) => {
    const skillDifference = getSkillValue(b.skill) - getSkillValue(a.skill)

    if (skillDifference !== 0) {
      return skillDifference
    }

    return String(a.joinedAt || a.id).localeCompare(String(b.joinedAt || b.id))
  })

  sortedPlayers.forEach((player) => {
    const lowestCount = Math.min(
      ...teamKeys.map((teamKey) => teamState[teamKey].count),
    )
    const targetTeam = teamKeys
      .filter((teamKey) => teamState[teamKey].count === lowestCount)
      .sort((a, b) => {
        const scoreDifference = teamState[a].score - teamState[b].score

        if (scoreDifference !== 0) {
          return scoreDifference
        }

        return teamKeys.indexOf(a) - teamKeys.indexOf(b)
      })[0]

    teamState[targetTeam].count += 1
    teamState[targetTeam].score += getSkillValue(player.skill)
    assignments.set(player.id, targetTeam)
  })

  return players.map((player) => ({
    ...player,
    team: assignments.get(player.id) || teamKeys[0],
  }))
}

export function groupPlayersByTeam(players = [], teamCount = 2) {
  return Object.fromEntries(
    getActiveTeamKeys(teamCount).map((teamKey) => [
      teamKey,
      players.filter((player) => player.team === teamKey),
    ]),
  )
}

function getCaptainPriority(skill) {
  const priority = CAPTAIN_SKILL_PRIORITY.indexOf(skill)
  return priority === -1 ? CAPTAIN_SKILL_PRIORITY.length : priority
}

function preferredCaptainId(players, teamKey, currentCaptainId = '') {
  const teamPlayers = players.filter((player) => player.team === teamKey)
  if (teamPlayers.length === 0) {
    return ''
  }

  const preferredPlayers = [...teamPlayers].sort((a, b) => {
    const priorityDifference =
      getCaptainPriority(a.skill) - getCaptainPriority(b.skill)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    return String(a.joinedAt || a.id).localeCompare(String(b.joinedAt || b.id))
  })
  const preferredPlayer = preferredPlayers[0]
  const currentCaptain = teamPlayers.find((player) => player.id === currentCaptainId)

  if (
    currentCaptain &&
    getCaptainPriority(currentCaptain.skill) === getCaptainPriority(preferredPlayer.skill)
  ) {
    return currentCaptain.id
  }

  return preferredPlayer.id
}

export function resolveCaptains(players, captains, teamCount = 2) {
  const currentCaptains = normalizeCaptains(captains)

  return getActiveTeamKeys(teamCount).reduce((nextCaptains, teamKey) => {
    nextCaptains[teamKey] = preferredCaptainId(
      players,
      teamKey,
      currentCaptains[teamKey],
    )
    return nextCaptains
  }, normalizeCaptains())
}
