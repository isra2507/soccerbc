export const TEAM_KEYS = ['penny', 'withoutPenny', 'team3', 'team4']
export const TEAM_COUNT_OPTIONS = [2, 3, 4]
export const PLAYER_POSITIONS = [
  { value: 'goalkeeper', label: 'Goalkeeper' },
  { value: 'defender', label: 'Defender' },
  { value: 'midfield', label: 'Midfield' },
  { value: 'striker', label: 'Striker' },
]
const CAPTAIN_SKILL_PRIORITY = ['semi-pro', 'professional', 'intermediate', 'beginner']

export function normalizePosition(position) {
  return PLAYER_POSITIONS.some((option) => option.value === position) ? position : ''
}

export function getPositionLabel(position) {
  return PLAYER_POSITIONS.find((option) => option.value === position)?.label || 'Not set'
}

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
    teamKeys.map((teamKey) => [teamKey, { count: 0, score: 0, goalkeepers: 0, positions: {} }]),
  )
  const assignments = new Map()
  const assignPlayer = (player, teamKey, direction = 1) => {
    const team = teamState[teamKey]
    team.count += direction
    team.score += direction * getSkillValue(player.skill)
    team.goalkeepers += player.position === 'goalkeeper' ? direction : 0
    team.positions[player.position] = (team.positions[player.position] || 0) + direction
    if (direction === 1) assignments.set(player.id, teamKey)
  }
  const lockedPlayers = players.filter((player) => player.manualTeam && teamKeys.includes(player.team))
  lockedPlayers.forEach((player) => {
    assignPlayer(player, player.team)
  })
  const sortedPlayers = players.filter((player) => !assignments.has(player.id)).sort((a, b) => {
    const skillDifference = getSkillValue(b.skill) - getSkillValue(a.skill)

    if (skillDifference !== 0) {
      return skillDifference
    }

    return String(a.joinedAt || a.id).localeCompare(String(b.joinedAt || b.id))
  })

  const chooseTeam = (player) => {
    const candidates = player.position === 'goalkeeper'
      ? teamKeys.filter((key) => teamState[key].goalkeepers === Math.min(...teamKeys.map((teamKey) => teamState[teamKey].goalkeepers)))
      : teamKeys
    return [...candidates]
      .sort((a, b) => {
        const countDifference = teamState[a].count - teamState[b].count
        if (countDifference !== 0) return countDifference
        const scoreDifference = teamState[a].score - teamState[b].score

        if (scoreDifference !== 0) {
          return scoreDifference
        }

        const positionDifference = (teamState[a].positions[player.position] || 0) - (teamState[b].positions[player.position] || 0)
        return positionDifference || teamKeys.indexOf(a) - teamKeys.indexOf(b)
      })[0]
  }

  // Reserve goalkeeper coverage before filling teams with field players.
  sortedPlayers.filter((player) => player.position === 'goalkeeper').forEach((player) => {
    assignPlayer(player, chooseTeam(player))
  })

  // A manual move must not leave all keepers on one team. Adjust only the
  // conflicting goalkeeper assignments; other staff moves stay in place.
  while (true) {
    const byKeepers = [...teamKeys].sort((a, b) => teamState[a].goalkeepers - teamState[b].goalkeepers)
    const lowest = byKeepers[0]
    const highest = byKeepers.at(-1)
    if (teamState[highest].goalkeepers - teamState[lowest].goalkeepers <= 1) break
    const keeper = [...players].reverse().find((player) => player.position === 'goalkeeper' && assignments.get(player.id) === highest)
    assignPlayer(keeper, highest, -1)
    assignPlayer(keeper, lowest)
  }

  sortedPlayers.filter((player) => player.position !== 'goalkeeper').forEach((player) => {
    assignPlayer(player, chooseTeam(player))
  })

  return players.map((player) => ({
    ...player,
    team: assignments.get(player.id) || teamKeys[0],
    manualTeam: Boolean(player.manualTeam && teamKeys.includes(player.team)),
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
