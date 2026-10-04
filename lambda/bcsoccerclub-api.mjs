import {
  createHmac,
  pbkdf2Sync,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'

const TABLE_NAME = process.env.TABLE_NAME
const STAFF_PASSWORD_HASH = process.env.STAFF_PASSWORD_HASH
const STAFF_AUTH_SECRET = process.env.STAFF_AUTH_SECRET
const STATE_KEY = 'state'
const MAX_WRITE_ATTEMPTS = 5
const AUTH_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60
const GAME_HOLD_MS = 3 * 60 * 60 * 1000
const PREVIOUS_TABLE_HOLD_MS = 7 * 24 * 60 * 60 * 1000
const PREVIOUS_TABLE_LIMIT = 1
const TEAM_KEYS = ['penny', 'withoutPenny', 'team3', 'team4']
const TEAM_COUNT_OPTIONS = [2, 3, 4]
const CAPTAIN_SKILL_PRIORITY = ['semi-pro', 'professional', 'intermediate', 'beginner']
const SKILL_POINTS = {
  beginner: 1,
  intermediate: 2,
  'semi-pro': 3,
  professional: 4,
}

const dynamodb = new DynamoDBClient({})

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'content-type': 'application/json',
}

const emptyState = {
  players: [],
  match: {
    teamCount: 2,
    nextMatchAt: '',
    updatedAt: '',
    updatedBy: '',
    pastGames: [],
    captains: {
      penny: '',
      withoutPenny: '',
      team3: '',
      team4: '',
    },
  },
}

function normalizeTeamCount(value) {
  const count = Number(value)
  return TEAM_COUNT_OPTIONS.includes(count) ? count : 2
}

function getActiveTeamKeys(teamCount = 2) {
  return TEAM_KEYS.slice(0, normalizeTeamCount(teamCount))
}

function normalizeCaptains(captains) {
  return Object.fromEntries(
    TEAM_KEYS.map((teamKey) => [teamKey, String(captains?.[teamKey] || '')]),
  )
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

const sanitizeTeam = (team) => (TEAM_KEYS.includes(team) ? team : TEAM_KEYS[0])
const getSkillValue = (skill) => SKILL_POINTS[skill] ?? SKILL_POINTS.beginner

const sanitizePlayer = (player, fallbackId = randomUUID()) => ({
  id: String(player?.id || fallbackId),
  firstName: String(player?.firstName || '').trim(),
  lastName: String(player?.lastName || '').trim(),
  skill: String(player?.skill || 'beginner'),
  team: sanitizeTeam(player?.team),
  manualTeam: player?.manualTeam === true,
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

function balanceTeamAssignments(players, teamCount = 2) {
  const normalizedPlayers = normalizePlayers(players)
  const teamKeys = getActiveTeamKeys(teamCount)
  const teamState = Object.fromEntries(
    teamKeys.map((teamKey) => [teamKey, { count: 0, score: 0 }]),
  )
  const assignments = new Map()
  const lockedPlayers = normalizedPlayers.filter((player) => player.manualTeam && teamKeys.includes(player.team))
  lockedPlayers.forEach((player) => {
    teamState[player.team].count += 1
    teamState[player.team].score += getSkillValue(player.skill)
    assignments.set(player.id, player.team)
  })
  const sortedPlayers = normalizedPlayers.filter((player) => !assignments.has(player.id)).sort((a, b) => {
    const skillDifference = getSkillValue(b.skill) - getSkillValue(a.skill)

    if (skillDifference !== 0) {
      return skillDifference
    }

    return (a.joinedAt || a.id).localeCompare(b.joinedAt || b.id)
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

  return normalizedPlayers.map((player) => ({
    ...player,
    team: assignments.get(player.id) || teamKeys[0],
    manualTeam: Boolean(player.manualTeam && teamKeys.includes(player.team)),
  }))
}

function addAndBalancePlayer(players, player, teamCount) {
  return balanceTeamAssignments([
    ...normalizePlayers(players).filter((item) => item.id !== player.id),
    player,
  ], teamCount)
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

    return (a.joinedAt || a.id).localeCompare(b.joinedAt || b.id)
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

function resolveCaptains(players, captains, teamCount) {
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
  const teamCount = normalizeTeamCount(game?.teamCount)

  return {
    id: String(game?.id || playedAt || `past-game-${index}`),
    playedAt,
    archivedAt: String(game?.archivedAt || ''),
    teamCount,
    captains: normalizeCaptains(game?.captains),
    teams: Object.fromEntries(
      getActiveTeamKeys(teamCount).map((teamKey) => [
        teamKey,
        normalizePastGamePlayers(teams[teamKey]),
      ]),
    ),
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
    teamCount: normalizeTeamCount(match?.teamCount),
    captains: normalizeCaptains(match?.captains),
    pastGames: normalizePastGames(match?.pastGames),
  }
}

function normalizeState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : emptyState
  const match = normalizeMatch(state.match)
  const players = balanceTeamAssignments(state.players, match.teamCount)

  return {
    players,
    match: {
      ...match,
      captains: resolveCaptains(players, match.captains, match.teamCount),
    },
  }
}

function createPastGameSnapshot(match, players) {
  if (!match?.nextMatchAt || players.length === 0) {
    return null
  }

  const teamCount = normalizeTeamCount(match.teamCount)

  return {
    id: `game-${getTime(match.nextMatchAt)}`,
    playedAt: match.nextMatchAt,
    archivedAt: new Date().toISOString(),
    teamCount,
    captains: normalizeCaptains(match.captains),
    teams: Object.fromEntries(
      getActiveTeamKeys(teamCount).map((teamKey) => [
        teamKey,
        players
          .filter((player) => player.team === teamKey)
          .map((player, index) =>
            sanitizePastGamePlayer(player, player.id || `past-player-${index}`),
          ),
      ]),
    ),
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

function parsePasswordRecord(record) {
  const [algorithm, iterationsValue, saltValue, hashValue] = String(record || '').split('$')
  const iterations = Number(iterationsValue)

  if (
    algorithm !== 'pbkdf2-sha256' ||
    !Number.isInteger(iterations) ||
    iterations < 100000 ||
    !saltValue ||
    !hashValue
  ) {
    return null
  }

  return {
    iterations,
    salt: Buffer.from(saltValue, 'base64'),
    hash: Buffer.from(hashValue, 'base64'),
  }
}

function passwordMatches(password) {
  const record = parsePasswordRecord(STAFF_PASSWORD_HASH)
  if (!record) {
    return false
  }

  const candidate = pbkdf2Sync(
    String(password || ''),
    record.salt,
    record.iterations,
    record.hash.length,
    'sha256',
  )

  return candidate.length === record.hash.length && timingSafeEqual(candidate, record.hash)
}

function signTokenPayload(payload) {
  return createHmac('sha256', STAFF_AUTH_SECRET).update(payload).digest('base64url')
}

function createStaffToken() {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'staff',
      exp: Math.floor(Date.now() / 1000) + AUTH_TOKEN_LIFETIME_SECONDS,
    }),
  ).toString('base64url')

  return `${payload}.${signTokenPayload(payload)}`
}

function hasValidStaffToken(event) {
  if (!STAFF_AUTH_SECRET) {
    return false
  }

  const authorization =
    event.headers?.authorization || event.headers?.Authorization || ''
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''
  const [payload, signature] = token.split('.')

  if (!payload || !signature) {
    return false
  }

  const expectedSignature = signTokenPayload(payload)
  const providedBytes = Buffer.from(signature)
  const expectedBytes = Buffer.from(expectedSignature)

  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return false
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return (
      claims.role === 'staff' &&
      Number.isFinite(claims.exp) &&
      claims.exp > Math.floor(Date.now() / 1000)
    )
  } catch {
    return false
  }
}

async function readStateRecord() {
  const result = await dynamodb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: { S: STATE_KEY },
      },
    }),
  )

  if (!result.Item?.data?.S) {
    return { state: normalizeState(emptyState), revision: 0 }
  }

  return {
    state: normalizeState(JSON.parse(result.Item.data.S)),
    revision: Number(result.Item.revision?.N || 0),
  }
}

async function writeState(nextState, expectedRevision) {
  const state = normalizeState(nextState)
  const revision = expectedRevision + 1

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
        revision: { N: String(revision) },
      },
      ConditionExpression:
        'attribute_not_exists(#revision) OR #revision = :expectedRevision',
      ExpressionAttributeNames: {
        '#revision': 'revision',
      },
      ExpressionAttributeValues: {
        ':expectedRevision': { N: String(expectedRevision) },
      },
    }),
  )

  return { state, revision }
}

function isWriteConflict(error) {
  return error?.name === 'ConditionalCheckFailedException'
}

async function readCurrentStateRecord() {
  const record = await readStateRecord()
  const { state } = record
  const startTime = getTime(state.match.nextMatchAt)

  if (startTime === null || startTime + GAME_HOLD_MS > Date.now()) {
    return record
  }

  const snapshot = createPastGameSnapshot(state.match, state.players)
  const pastGames = snapshot
    ? [
        snapshot,
        ...normalizePastGames(state.match.pastGames).filter(
          (game) => game.playedAt !== snapshot.playedAt,
        ),
      ].slice(0, PREVIOUS_TABLE_LIMIT)
    : normalizePastGames(state.match.pastGames)

  try {
    return await writeState(
      {
        players: [],
        match: {
          ...state.match,
          nextMatchAt: '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Automatic game reset',
          captains: normalizeCaptains(),
          pastGames,
        },
      },
      record.revision,
    )
  } catch (error) {
    if (isWriteConflict(error)) {
      return readCurrentStateRecord()
    }
    throw error
  }
}

async function readCurrentState() {
  return (await readCurrentStateRecord()).state
}

async function updateCurrentState(buildNextState) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const record = await readCurrentStateRecord()

    try {
      return (await writeState(buildNextState(record.state), record.revision)).state
    } catch (error) {
      if (!isWriteConflict(error)) {
        throw error
      }
    }
  }

  const error = new Error('The roster changed at the same time. Please try again.')
  error.statusCode = 409
  throw error
}

function authenticate(event) {
  if (!parsePasswordRecord(STAFF_PASSWORD_HASH) || !STAFF_AUTH_SECRET) {
    return jsonResponse(500, {
      message: 'Staff authentication is not configured on the server.',
    })
  }

  if (!passwordMatches(parseBody(event)?.password)) {
    return jsonResponse(401, { message: 'Wrong staff password.' })
  }

  return jsonResponse(200, {
    token: createStaffToken(),
    expiresIn: AUTH_TOKEN_LIFETIME_SECONDS,
  })
}

async function addPlayer(event) {
  const player = sanitizePlayer({ ...parseBody(event), manualTeam: false })

  if (!player.firstName || !player.lastName) {
    return jsonResponse(400, { message: 'First name and last name are required.' })
  }

  const nextState = await updateCurrentState((state) => {
    if (!state.match.nextMatchAt) {
      const error = new Error(
        'Registration opens after staff sets the next soccer date.',
      )
      error.statusCode = 400
      throw error
    }

    const players = addAndBalancePlayer(
      state.players,
      player,
      state.match.teamCount,
    )

    return {
      ...state,
      players,
      match: {
        ...state.match,
        captains: resolveCaptains(
          players,
          state.match.captains,
          state.match.teamCount,
        ),
      },
    }
  })

  return jsonResponse(200, nextState)
}

async function replacePlayers(event) {
  const body = parseBody(event)
  const incomingPlayers = Array.isArray(body) ? body : body?.players
  const nextState = await updateCurrentState((state) => {
    const players = balanceTeamAssignments(incomingPlayers, state.match.teamCount)

    return {
      ...state,
      players,
      match: {
        ...state.match,
        captains: resolveCaptains(
          players,
          state.match.captains,
          state.match.teamCount,
        ),
      },
    }
  })

  return jsonResponse(200, nextState)
}

async function updateMatch(event) {
  const body = parseBody(event)
  const incomingMatch = body?.match && typeof body.match === 'object' ? body.match : body
  const nextState = await updateCurrentState((state) => {
    const match = normalizeMatch(incomingMatch)
    const players = balanceTeamAssignments(state.players, match.teamCount)

    return {
      players,
      match: {
        ...match,
        captains: resolveCaptains(players, match.captains, match.teamCount),
      },
    }
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

    if (method === 'POST' && path === '/auth') {
      return authenticate(event)
    }

    if (method === 'GET' && path === '/state') {
      return jsonResponse(200, await readCurrentState())
    }

    if (method === 'POST' && path === '/players') {
      return addPlayer(event)
    }

    if (
      method === 'PUT' &&
      (path === '/players' || path === '/match') &&
      !hasValidStaffToken(event)
    ) {
      return jsonResponse(401, { message: 'Staff login is required.' })
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
    return jsonResponse(error.statusCode || 500, {
      message: error.message || 'Server error.',
    })
  }
}
