import { randomUUID } from 'node:crypto'
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME
const STATE_KEY = 'state'
const PREVIOUS_TABLE_HOLD_MS = 7 * 24 * 60 * 60 * 1000
const PREVIOUS_TABLE_LIMIT = 1
const TEAM_KEYS = ['penny', 'withoutPenny']
const SKILL_POINTS = {
  beginner: 1,
  intermediate: 2,
  'semi-pro': 3,
  professional: 4,
}

const dynamodb = new DynamoDBClient({})

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'content-type': 'application/json',
}

const emptyState = {
  players: [],
  match: {
    nextMatchAt: '',
    updatedAt: '',
    updatedBy: '',
    pastGames: [],
    captains: {
      penny: '',
      withoutPenny: '',
    },
  },
}

function normalizeCaptains(captains) {
  return {
    penny: String(captains?.penny || ''),
    withoutPenny: String(captains?.withoutPenny || ''),
  }
}

function getTime(value) {
  if (!value) {
    return null
  }

  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function isPreviousTableFresh(game) {
  const savedTime = getTime(game?.archivedAt) ?? getTime(game?.playedAt)

  return savedTime !== null && Date.now() - savedTime <= PREVIOUS_TABLE_HOLD_MS
}

const sanitizeTeam = (team) => (team === 'withoutPenny' ? 'withoutPenny' : 'penny')
const getSkillValue = (skill) => SKILL_POINTS[skill] ?? SKILL_POINTS.beginner

const sanitizePlayer = (player, fallbackId = randomUUID()) => ({
  id: String(player?.id || fallbackId),
  firstName: String(player?.firstName || '').trim(),
  lastName: String(player?.lastName || '').trim(),
  skill: String(player?.skill || 'beginner'),
  team: sanitizeTeam(player?.team),
  joinedAt: String(player?.joinedAt || new Date().toISOString()),
  updatedAt: String(player?.updatedAt || ''),
  updatedBy: String(player?.updatedBy || ''),
})

const sanitizePastGamePlayer = (player, fallbackId) => ({
  id: String(player?.id || fallbackId),
  firstName: String(player?.firstName || '').trim(),
  lastName: String(player?.lastName || '').trim(),
  skill: String(player?.skill || 'beginner'),
  team: sanitizeTeam(player?.team),
})

function normalizePlayers(players) {
  if (!players) {
    return []
  }

  if (Array.isArray(players)) {
    return players
      .map((player, index) => sanitizePlayer(player, player?.id || `player-${index}`))
      .filter((player) => player.firstName && player.lastName)
  }

  return Object.entries(players)
    .map(([id, player]) => sanitizePlayer(player, id))
    .filter((player) => player.firstName && player.lastName)
    .sort((a, b) => (a.joinedAt || a.id).localeCompare(b.joinedAt || b.id))
}

function balanceTeamAssignments(players) {
  const normalizedPlayers = normalizePlayers(players)
  const teamState = TEAM_KEYS.reduce((state, teamKey) => {
    state[teamKey] = { count: 0, score: 0 }
    return state
  }, {})
  const maxTeamSize = Math.ceil(normalizedPlayers.length / TEAM_KEYS.length)
  const assignments = new Map()
  const sortedPlayers = [...normalizedPlayers].sort((a, b) => {
    const skillDifference = getSkillValue(b.skill) - getSkillValue(a.skill)

    if (skillDifference !== 0) {
      return skillDifference
    }

    return (a.joinedAt || a.id).localeCompare(b.joinedAt || b.id)
  })

  sortedPlayers.forEach((player) => {
    const availableTeams = TEAM_KEYS.filter(
      (teamKey) => teamState[teamKey].count < maxTeamSize,
    )
    const targetTeam = availableTeams.sort((a, b) => {
      const scoreDifference = teamState[a].score - teamState[b].score

      if (scoreDifference !== 0) {
        return scoreDifference
      }

      return teamState[a].count - teamState[b].count
    })[0]

    teamState[targetTeam].count += 1
    teamState[targetTeam].score += getSkillValue(player.skill)
    assignments.set(player.id, targetTeam)
  })

  return normalizedPlayers.map((player) => ({
    ...player,
    team: assignments.get(player.id) || player.team,
  }))
}

function addAndBalancePlayer(players, player) {
  return balanceTeamAssignments([
    ...normalizePlayers(players).filter((item) => item.id !== player.id),
    player,
  ])
}

function normalizePastGamePlayers(players) {
  if (!Array.isArray(players)) {
    return []
  }

  return players
    .map((player, index) => sanitizePastGamePlayer(player, player?.id || `past-player-${index}`))
    .filter((player) => player.firstName && player.lastName)
}

function normalizePastGame(game, index) {
  const playedAt = String(game?.playedAt || '')
  const teams = game?.teams && typeof game.teams === 'object' ? game.teams : {}

  return {
    id: String(game?.id || playedAt || `past-game-${index}`),
    playedAt,
    archivedAt: String(game?.archivedAt || ''),
    captains: normalizeCaptains(game?.captains),
    teams: {
      penny: normalizePastGamePlayers(teams.penny),
      withoutPenny: normalizePastGamePlayers(teams.withoutPenny),
    },
  }
}

function normalizePastGames(pastGames) {
  if (!Array.isArray(pastGames)) {
    return []
  }

  return pastGames
    .map((game, index) => normalizePastGame(game, index))
    .filter((game) => game.playedAt && isPreviousTableFresh(game))
    .slice(0, PREVIOUS_TABLE_LIMIT)
}

function normalizeMatch(match) {
  return {
    ...emptyState.match,
    ...(match && typeof match === 'object' ? match : {}),
    captains: normalizeCaptains(match?.captains),
    pastGames: normalizePastGames(match?.pastGames),
  }
}

function normalizeState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : emptyState

  return {
    players: normalizePlayers(state.players),
    match: normalizeMatch(state.match),
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}

function getMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || 'GET'
}

function getPath(event) {
  const path = event.rawPath || event.path || '/'
  return path.replace(/\/+$/g, '') || '/'
}

function parseBody(event) {
  if (!event.body) {
    return null
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  return JSON.parse(rawBody)
}

async function readState() {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: { S: STATE_KEY },
      },
    }),
  )

  if (!result.Item?.data?.S) {
    return normalizeState(emptyState)
  }

  return normalizeState(JSON.parse(result.Item.data.S))
}

async function writeState(nextState) {
  const state = normalizeState(nextState)

  await dynamodb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: { S: STATE_KEY },
        data: {
          S: JSON.stringify({
            ...state,
            savedAt: new Date().toISOString(),
          }),
        },
      },
    }),
  )

  return state
}

async function addPlayer(event) {
  const player = sanitizePlayer(parseBody(event))

  if (!player.firstName || !player.lastName) {
    return jsonResponse(400, { message: 'First name and last name are required.' })
  }

  const state = await readState()
  const players = addAndBalancePlayer(state.players, player)
  const nextState = await writeState({ ...state, players })

  return jsonResponse(200, nextState)
}

async function replacePlayers(event) {
  const body = parseBody(event)
  const incomingPlayers = Array.isArray(body) ? body : body?.players
  const state = await readState()
  const nextState = await writeState({
    ...state,
    players: normalizePlayers(incomingPlayers),
  })

  return jsonResponse(200, nextState)
}

async function updateMatch(event) {
  const body = parseBody(event)
  const match = body?.match && typeof body.match === 'object' ? body.match : body
  const state = await readState()
  const nextState = await writeState({
    ...state,
    match: normalizeMatch(match),
  })

  return jsonResponse(200, nextState)
}

export const handler = async (event) => {
  try {
    if (!TABLE_NAME) {
      return jsonResponse(500, { message: 'TABLE_NAME environment variable is missing.' })
    }

    const method = getMethod(event)
    const path = getPath(event)

    if (method === 'OPTIONS') {
      return jsonResponse(204, {})
    }

    if (method === 'GET' && path === '/state') {
      return jsonResponse(200, await readState())
    }

    if (method === 'POST' && path === '/players') {
      return addPlayer(event)
    }

    if (method === 'PUT' && path === '/players') {
      return replacePlayers(event)
    }

    if (method === 'PUT' && path === '/match') {
      return updateMatch(event)
    }

    return jsonResponse(404, { message: `No route for ${method} ${path}.` })
  } catch (error) {
    console.error(error)
    return jsonResponse(500, { message: error.message || 'Server error.' })
  }
}
