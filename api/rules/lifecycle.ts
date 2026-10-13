import {
  DEFAULT_TEAM_COUNT,
  GAME_HOLD_MS,
  PREVIOUS_GAME_VISIBLE_MS,
  getActiveTeamKeys,
} from '../../shared/constants.ts'
import type { ArchivedGame, Game, PreviousGameResponse, State } from '../../shared/schemas.ts'
import { emptyCaptains, noManualCaptains } from './captains.ts'

export const AUTOMATIC_RESET_ACTOR = 'Automatic game reset'

export function emptyGame(): Game {
  return {
    teamCount: DEFAULT_TEAM_COUNT,
    nextMatchAt: null,
    announcement: '',
    players: [],
    captains: emptyCaptains(),
    manualCaptains: noManualCaptains(),
    previousGame: null,
    updatedAt: '',
    updatedBy: '',
  }
}

const toTime = (value: string | null): number | null => {
  if (!value) {
    return null
  }

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/** True once the board has been up for GAME_HOLD_MS after kickoff. */
export function isOver(game: Game, now: number): boolean {
  const start = toTime(game.nextMatchAt)
  return start !== null && now >= start + GAME_HOLD_MS
}

/**
 * Freezes the current teams for the record. Null when there is nothing to keep.
 * `archivedAt` is passed in, never read from a clock, so the same game always
 * produces the same record no matter when it is computed.
 */
export function snapshotGame(game: Game, archivedAt: number): ArchivedGame | null {
  const start = toTime(game.nextMatchAt)

  if (start === null || game.players.length === 0) {
    return null
  }

  const teams: ArchivedGame['teams'] = { team1: [], team2: [], team3: [], team4: [] }

  for (const key of getActiveTeamKeys(game.teamCount)) {
    teams[key] = game.players
      .filter((player) => player.team === key)
      .map(({ id, firstName, lastName, skill, team }) => ({ id, firstName, lastName, skill, team }))
  }

  return {
    id: `game-${start}`,
    playedAt: game.nextMatchAt!,
    archivedAt: new Date(archivedAt).toISOString(),
    teamCount: game.teamCount,
    captains: { ...game.captains },
    teams,
  }
}

/** The game after archiving `game`: empty board, team count kept, last game remembered. */
export function startNextGame(game: Game, archived: ArchivedGame | null, now: number): Game {
  return {
    ...emptyGame(),
    teamCount: game.teamCount,
    previousGame: archived ?? game.previousGame,
    updatedAt: new Date(now).toISOString(),
    updatedBy: AUTOMATIC_RESET_ACTOR,
  }
}

/**
 * If the game is over, returns the next (empty) game plus the archive record to
 * persist alongside it. Otherwise returns the game unchanged. Never mutates.
 */
export function rollover(
  game: Game,
  now: number,
): { game: Game; archived: ArchivedGame | null } {
  if (!isOver(game, now)) {
    return { game, archived: null }
  }

  // The game ended at kickoff + hold, whenever someone happens to notice.
  const endedAt = toTime(game.nextMatchAt)! + GAME_HOLD_MS
  const archived = snapshotGame(game, endedAt)
  return { game: startNextGame(game, archived, now), archived }
}

const isPreviousGameVisible = (previous: ArchivedGame, now: number): boolean => {
  const savedAt = toTime(previous.archivedAt) ?? toTime(previous.playedAt)
  return savedAt !== null && now - savedAt <= PREVIOUS_GAME_VISIBLE_MS
}

/**
 * The live board clients see. A pure function of the stored game and the clock, so
 * reads never need to write: an over game already looks archived before anyone saves it.
 */
export function toState(game: Game, now: number): State {
  const { game: current } = rollover(game, now)

  return {
    players: current.players,
    match: {
      teamCount: current.teamCount,
      nextMatchAt: current.nextMatchAt,
      announcement: current.announcement,
      captains: current.captains,
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
    },
  }
}

/** The latest finished game, hidden once it is older than the visibility window. */
export function toPreviousGame(game: Game, now: number): PreviousGameResponse {
  const { previousGame } = rollover(game, now).game

  return { game: previousGame && isPreviousGameVisible(previousGame, now) ? previousGame : null }
}
