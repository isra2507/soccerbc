const LOCAL_STORAGE_KEY = 'bc-soccer-live-board'
const PAST_GAME_LIMIT = 2

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/g, '')
const firebaseDatabaseUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL?.trim()
const firebaseDataPath = (
  import.meta.env.VITE_FIREBASE_DATA_PATH || 'bc-soccer-club'
)
  .trim()
  .replace(/^\/+|\/+$/g, '')

const hasApiBackend = Boolean(apiBaseUrl)
const hasFirebaseDatabase = Boolean(firebaseDatabaseUrl)
const hasSharedDatabase = hasApiBackend || hasFirebaseDatabase
const isLocalRuntime =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
const requiresCloudDatabase =
  import.meta.env.PROD && !hasSharedDatabase && !isLocalRuntime
const sharedDatabaseRequiredMessage =
  'Shared database is not configured. Add VITE_API_BASE_URL in GitHub Actions variables and redeploy so roster and match changes sync across devices.'

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

const sanitizeTeam = (team) => (team === 'withoutPenny' ? 'withoutPenny' : 'penny')

const sanitizePlayer = (player, fallbackId) => ({
  id: String(player?.id || fallbackId),
  firstName: String(player?.firstName || '').trim(),
  lastName: String(player?.lastName || '').trim(),
  skill: String(player?.skill || 'beginner'),
  team: sanitizeTeam(player?.team),
  joinedAt: String(player?.joinedAt || ''),
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
    .filter((game) => game.playedAt)
    .slice(0, PAST_GAME_LIMIT)
}

function normalizeState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : emptyState

  return {
    players: normalizePlayers(state.players),
    match: {
      ...emptyState.match,
      ...(state.match && typeof state.match === 'object' ? state.match : {}),
      captains: normalizeCaptains(state.match?.captains),
      pastGames: normalizePastGames(state.match?.pastGames),
    },
    mode: hasSharedDatabase ? 'cloud' : requiresCloudDatabase ? 'missing-cloud' : 'local',
    message: requiresCloudDatabase ? sharedDatabaseRequiredMessage : '',
  }
}

function getLocalState() {
  try {
    const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    return normalizeState(saved ? JSON.parse(saved) : emptyState)
  } catch {
    return normalizeState(emptyState)
  }
}

function setLocalState(nextState) {
  window.localStorage.setItem(
    LOCAL_STORAGE_KEY,
    JSON.stringify({
      players: nextState.players,
      match: nextState.match,
    }),
  )
}

function firebaseUrl(path = '') {
  const root = firebaseDatabaseUrl.replace(/\/+$/g, '')
  const encodedPath = firebaseDataPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  const encodedChildPath = path
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  const fullPath = [encodedPath, encodedChildPath].filter(Boolean).join('/')

  return `${root}/${fullPath}.json`
}

function apiUrl(path = '') {
  return `${apiBaseUrl}/${path.replace(/^\/+/g, '')}`
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text()
  let payload = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(fallbackMessage)
    }
  }

  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(fallbackMessage)
  }

  return payload
}

async function apiRequest(method, path, body) {
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  return readJsonResponse(response, 'AWS roster API returned an invalid response.')
}

async function firebaseRequest(method, path, body) {
  const response = await fetch(firebaseUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Database request failed: ${response.status}`)
  }

  return response.json()
}

function playersToRecord(players) {
  return players.reduce((record, player) => {
    record[player.id] = player
    return record
  }, {})
}

function hasBoardContent(state) {
  return (
    state.players.length > 0 ||
    Boolean(state.match?.nextMatchAt) ||
    normalizePastGames(state.match?.pastGames).length > 0
  )
}

async function seedCloudFromLocalIfEmpty(cloudState) {
  if (hasBoardContent(cloudState)) {
    return cloudState
  }

  const localState = getLocalState()
  if (!hasBoardContent(localState)) {
    return cloudState
  }

  const migratedState = {
    players: playersToRecord(localState.players),
    match: localState.match,
    migratedAt: new Date().toISOString(),
  }

  await firebaseRequest('PUT', '', migratedState)
  return normalizeState(migratedState)
}

async function seedApiFromLocalIfEmpty(apiState) {
  if (hasBoardContent(apiState)) {
    return apiState
  }

  const localState = getLocalState()
  if (!hasBoardContent(localState)) {
    return apiState
  }

  await apiRequest('PUT', '/players', localState.players)
  await apiRequest('PUT', '/match', localState.match)
  return normalizeState(localState)
}

function assertWritableStorage() {
  if (requiresCloudDatabase) {
    throw new Error(sharedDatabaseRequiredMessage)
  }
}

export async function loadState() {
  if (hasApiBackend) {
    const state = await apiRequest('GET', '/state')
    return seedApiFromLocalIfEmpty(normalizeState(state))
  }

  if (!hasFirebaseDatabase) {
    if (requiresCloudDatabase) {
      return normalizeState(emptyState)
    }

    return getLocalState()
  }

  const state = await firebaseRequest('GET', '')
  return seedCloudFromLocalIfEmpty(normalizeState(state))
}

export async function addPlayer(player) {
  assertWritableStorage()

  if (hasApiBackend) {
    await apiRequest('POST', '/players', player)
    return
  }

  if (!hasFirebaseDatabase) {
    const current = getLocalState()
    setLocalState({
      ...current,
      players: [...current.players, player],
    })
    return
  }

  await firebaseRequest('PUT', `players/${player.id}`, player)
}

export async function replacePlayers(players) {
  assertWritableStorage()

  if (hasApiBackend) {
    await apiRequest('PUT', '/players', players)
    return
  }

  if (!hasFirebaseDatabase) {
    const current = getLocalState()
    setLocalState({
      ...current,
      players,
    })
    return
  }

  await firebaseRequest('PUT', 'players', playersToRecord(players))
}

export async function updateMatch(match) {
  assertWritableStorage()

  if (hasApiBackend) {
    await apiRequest('PUT', '/match', match)
    return
  }

  if (!hasFirebaseDatabase) {
    const current = getLocalState()
    setLocalState({
      ...current,
      match,
    })
    return
  }

  await firebaseRequest('PUT', 'match', match)
}

export function subscribeState(onChange, onError) {
  let active = true

  const refresh = async () => {
    try {
      const state = await loadState()
      if (active) {
        onChange(state)
      }
    } catch (error) {
      if (active) {
        onError(error)
      }
    }
  }

  refresh()

  const storageHandler = (event) => {
    if (event.key === LOCAL_STORAGE_KEY) {
      refresh()
    }
  }

  const interval = hasSharedDatabase ? window.setInterval(refresh, 4000) : null
  window.addEventListener('storage', storageHandler)

  return () => {
    active = false
    if (interval) {
      window.clearInterval(interval)
    }
    window.removeEventListener('storage', storageHandler)
  }
}
