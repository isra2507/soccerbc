import {
  MAX_NAME_LENGTH,
  SKILLS,
  TEAM_COUNTS,
  TEAM_KEYS,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type { ArchivedGame, ArchivedPlayer, Game, Player } from '../../shared/schemas.ts'
import { balancePlayers } from '../rules/balance.ts'
import { noManualCaptains, resolveCaptains, emptyCaptains } from '../rules/captains.ts'
import { emptyGame } from '../rules/lifecycle.ts'

type Loose = Record<string, unknown>

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ')
const name = (value: unknown): string => text(value).slice(0, MAX_NAME_LENGTH)

const skill = (value: unknown): Player['skill'] =>
  (SKILLS as readonly string[]).includes(String(value)) ? (value as Player['skill']) : 'beginner'

// Earlier versions called the first two teams after the pinnie they did or didn't wear.
const LEGACY_TEAM_NAMES: Record<string, TeamKey> = { penny: 'team1', withoutPenny: 'team2' }

/** Maps a stored team name, old or new, to a current key; anything unknown becomes team1. */
const team = (value: unknown): TeamKey => {
  const name = String(value)
  return LEGACY_TEAM_NAMES[name] ?? ((TEAM_KEYS as readonly string[]).includes(name) ? (name as TeamKey) : 'team1')
}

/** Reads a per-team value from an old record, which may use old or current team names. */
const forTeam = (record: Loose, key: TeamKey): unknown => {
  const legacyName = Object.keys(LEGACY_TEAM_NAMES).find((name) => LEGACY_TEAM_NAMES[name] === key)
  return record[key] ?? (legacyName ? record[legacyName] : undefined)
}

const teamCount = (value: unknown): TeamCount =>
  (TEAM_COUNTS as readonly number[]).includes(Number(value)) ? (Number(value) as TeamCount) : 2

const instant = (value: unknown): string | null => {
  const time = Date.parse(String(value ?? ''))
  return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/** The old roster was either an array or a record keyed by id. */
const entries = (value: unknown): [string, unknown][] =>
  Array.isArray(value)
    ? value.map((item, index) => [`player-${index}`, item])
    : isObject(value)
      ? Object.entries(value)
      : []

function convertPlayers(raw: unknown): Player[] {
  const seen = new Set<string>()
  const players: Player[] = []

  for (const [fallbackId, item] of entries(raw)) {
    if (!isObject(item)) {
      continue
    }

    const id = text(item.id || fallbackId).slice(0, 64)
    const firstName = name(item.firstName)
    const lastName = name(item.lastName)

    if (!id || !firstName || !lastName || seen.has(id)) {
      continue
    }

    seen.add(id)
    players.push({
      id,
      firstName,
      lastName,
      skill: skill(item.skill),
      team: team(item.team),
      manualTeam: item.manualTeam === true,
      joinedAt: instant(item.joinedAt) ?? '',
      updatedAt: text(item.updatedAt),
      updatedBy: text(item.updatedBy),
    })
  }

  return players
}

function convertArchivedGame(raw: unknown): ArchivedGame | null {
  if (!isObject(raw)) {
    return null
  }

  const playedAt = instant(raw.playedAt)

  if (!playedAt) {
    return null
  }

  const rawTeams = isObject(raw.teams) ? raw.teams : {}
  const teams: ArchivedGame['teams'] = { team1: [], team2: [], team3: [], team4: [] }

  for (const key of TEAM_KEYS) {
    teams[key] = convertPlayers(forTeam(rawTeams, key)).map(
      ({ id, firstName, lastName, skill: level }): ArchivedPlayer => ({
        id,
        firstName,
        lastName,
        skill: level,
        team: key,
      }),
    )
  }

  const rawCaptains = isObject(raw.captains) ? raw.captains : {}
  const captains = emptyCaptains()

  for (const key of TEAM_KEYS) {
    captains[key] = text(forTeam(rawCaptains, key))
  }

  return {
    id: text(raw.id) || `game-${Date.parse(playedAt)}`,
    playedAt,
    archivedAt: instant(raw.archivedAt) ?? playedAt,
    teamCount: teamCount(raw.teamCount),
    captains,
    teams,
  }
}

/**
 * Turns the old single `state` blob (any of the shapes it has had over time) into
 * the current Game plus the finished game to keep in history. Tolerant of missing
 * and malformed fields; never throws on bad data.
 */
export function convertLegacyState(raw: unknown): { game: Game; archived: ArchivedGame | null } {
  const legacy = isObject(raw) ? raw : {}
  const match = isObject(legacy.match) ? legacy.match : {}
  const count = teamCount(match.teamCount)
  const players = balancePlayers(convertPlayers(legacy.players), count)

  const rawCaptains = isObject(match.captains) ? match.captains : {}
  const currentCaptains = emptyCaptains()

  for (const key of TEAM_KEYS) {
    currentCaptains[key] = text(forTeam(rawCaptains, key))
  }

  const { captains, manualCaptains } = resolveCaptains(
    players,
    currentCaptains,
    noManualCaptains(),
    count,
  )
  const pastGames = Array.isArray(match.pastGames) ? match.pastGames : []
  const archived = pastGames.map(convertArchivedGame).find((game) => game !== null) ?? null

  return {
    archived,
    game: {
      ...emptyGame(),
      teamCount: count,
      nextMatchAt: instant(match.nextMatchAt),
      announcement: text(match.announcement).slice(0, 1000),
      players,
      captains,
      manualCaptains,
      previousGame: archived,
      updatedAt: text(match.updatedAt),
      updatedBy: text(match.updatedBy),
    },
  }
}
