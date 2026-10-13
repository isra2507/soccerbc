import {
  GAME_HOLD_MS,
  MAX_PLAYERS,
  getActiveTeamKeys,
  type TeamCount,
  type TeamKey,
} from '../../shared/constants.ts'
import type {
  ArchivedGame,
  Game,
  MatchInput,
  Player,
  PlayerPatch,
  SignupInput,
} from '../../shared/schemas.ts'
import { badRequest, conflict, notFound } from '../errors.ts'
import { balancePlayers } from './balance.ts'
import { emptyCaptains, noManualCaptains, resolveCaptains } from './captains.ts'
import { snapshotGame } from './lifecycle.ts'

export type CommandContext = {
  now: number
  newId: () => string
  /** Display name of whoever is acting; recorded as `updatedBy`. */
  actor: string
}

export type CommandResult = {
  game: Game
  /** A finished game to keep permanently, written together with `game`. */
  archived?: ArchivedGame | null
}

const iso = (time: number) => new Date(time).toISOString()

const nameKey = (player: Pick<Player, 'firstName' | 'lastName'>) =>
  `${player.firstName} ${player.lastName}`.toLocaleLowerCase('en-US')

/** Rebalances teams, re-resolves captains and stamps who changed what. */
function finish(
  game: Game,
  players: Player[],
  ctx: CommandContext,
  { touch = true }: { touch?: boolean } = {},
): Game {
  const balanced = balancePlayers(players, game.teamCount)
  const { captains, manualCaptains } = resolveCaptains(
    balanced,
    game.captains,
    game.manualCaptains,
    game.teamCount,
  )

  return {
    ...game,
    players: balanced,
    captains,
    manualCaptains,
    ...(touch ? { updatedAt: iso(ctx.now), updatedBy: ctx.actor } : {}),
  }
}

export function signUp(game: Game, input: SignupInput, ctx: CommandContext): CommandResult {
  if (!game.nextMatchAt) {
    throw badRequest('Registration opens after staff sets the next soccer date.')
  }

  if (game.players.some((existing) => nameKey(existing) === nameKey(input))) {
    throw conflict('That name is already on the list.')
  }

  if (game.players.length >= MAX_PLAYERS) {
    throw conflict('The roster is full. Please contact the club.')
  }

  const player: Player = {
    id: ctx.newId(),
    firstName: input.firstName,
    lastName: input.lastName,
    skill: input.skill,
    team: 'team1',
    manualTeam: false,
    joinedAt: iso(ctx.now),
    updatedAt: '',
    updatedBy: '',
  }

  // Public sign-ups are not a staff edit, so they do not change `updatedBy`.
  return { game: finish(game, [...game.players, player], ctx, { touch: false }) }
}

export function patchPlayer(
  game: Game,
  playerId: string,
  patch: PlayerPatch,
  ctx: CommandContext,
): CommandResult {
  const existing = game.players.find((player) => player.id === playerId)

  if (!existing) {
    throw notFound('Player not found.')
  }

  if (patch.team && !getActiveTeamKeys(game.teamCount).includes(patch.team)) {
    throw badRequest('That team is not in use for this game.')
  }

  const updated: Player = {
    ...existing,
    ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
    ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
    ...(patch.skill !== undefined ? { skill: patch.skill } : {}),
    ...(patch.team !== undefined ? { team: patch.team, manualTeam: true } : {}),
    updatedAt: iso(ctx.now),
    updatedBy: ctx.actor,
  }

  if (
    game.players.some((other) => other.id !== playerId && nameKey(other) === nameKey(updated))
  ) {
    throw conflict('That name is already on the list.')
  }

  return {
    game: finish(
      game,
      game.players.map((player) => (player.id === playerId ? updated : player)),
      ctx,
    ),
  }
}

export function removePlayer(game: Game, playerId: string, ctx: CommandContext): CommandResult {
  if (!game.players.some((player) => player.id === playerId)) {
    throw notFound('Player not found.')
  }

  return {
    game: finish(
      game,
      game.players.filter((player) => player.id !== playerId),
      ctx,
    ),
  }
}

/** Releases every manual team and captain choice and rebuilds balanced teams. */
export function rebalance(game: Game, ctx: CommandContext, teamCount?: TeamCount): CommandResult {
  const fresh: Game = {
    ...game,
    teamCount: teamCount ?? game.teamCount,
    captains: emptyCaptains(),
    manualCaptains: noManualCaptains(),
  }

  return {
    game: finish(
      fresh,
      game.players.map((player) => ({ ...player, manualTeam: false })),
      ctx,
    ),
  }
}

export function setMatch(game: Game, input: MatchInput, ctx: CommandContext): CommandResult {
  let result: CommandResult = { game }

  if (input.teamCount !== undefined && input.teamCount !== game.teamCount) {
    result = rebalance(game, ctx, input.teamCount)
  }

  if (input.nextMatchAt !== undefined) {
    const dated = setMatchDate(result.game, input.nextMatchAt, ctx)
    result = { game: dated.game, archived: dated.archived ?? result.archived }
  }

  return result
}

/**
 * Moving the date starts a fresh table. If the old game had already kicked off it is
 * archived first; a game that was never played is just discarded.
 */
function setMatchDate(game: Game, requested: string | null, ctx: CommandContext): CommandResult {
  const nextMatchAt = requested === null ? null : iso(Date.parse(requested))

  if (nextMatchAt === game.nextMatchAt) {
    return { game }
  }

  if (nextMatchAt !== null && ctx.now >= Date.parse(nextMatchAt) + GAME_HOLD_MS) {
    throw badRequest('That date has already passed. Choose an upcoming date.')
  }

  const wasPlayed = game.nextMatchAt !== null && ctx.now >= Date.parse(game.nextMatchAt)
  const archived = wasPlayed ? snapshotGame(game, ctx.now) : null

  return {
    archived,
    game: {
      ...game,
      nextMatchAt,
      announcement: '',
      players: [],
      captains: emptyCaptains(),
      manualCaptains: noManualCaptains(),
      previousGame: archived ?? game.previousGame,
      updatedAt: iso(ctx.now),
      updatedBy: ctx.actor,
    },
  }
}

export function setAnnouncement(game: Game, text: string, ctx: CommandContext): CommandResult {
  if (text && !game.nextMatchAt) {
    throw badRequest('Set an upcoming soccer date before publishing an announcement.')
  }

  return {
    game: { ...game, announcement: text, updatedAt: iso(ctx.now), updatedBy: ctx.actor },
  }
}

/**
 * Staff pick a captain. The chosen player is also pinned to the team, so a later
 * sign-up cannot rebalance them away from the role. An empty `playerId` hands the
 * choice back to automatic (the player stays pinned until the next rebalance).
 */
export function setCaptain(
  game: Game,
  team: TeamKey,
  playerId: string,
  ctx: CommandContext,
): CommandResult {
  if (!getActiveTeamKeys(game.teamCount).includes(team)) {
    throw badRequest('That team is not in use for this game.')
  }

  const manualCaptains = { ...game.manualCaptains, [team]: playerId !== '' }
  const captains = { ...game.captains, [team]: playerId }

  if (playerId !== '') {
    const player = game.players.find((candidate) => candidate.id === playerId)

    if (!player || player.team !== team) {
      throw badRequest('That player is not on this team.')
    }
  }

  const players = game.players.map((candidate) =>
    candidate.id === playerId ? { ...candidate, manualTeam: true } : candidate,
  )

  return {
    game: finish({ ...game, captains, manualCaptains }, players, ctx),
  }
}
