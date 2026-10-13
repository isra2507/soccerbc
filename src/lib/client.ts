import type { TeamKey } from '../../shared/constants.ts'
import type {
  MatchInput,
  PlayerPatch,
  PreviousGameResponse,
  SignupInput,
  State,
} from '../../shared/schemas.ts'

/** An error from the API (or from reaching it) with a message that is safe to show. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export type ClientOptions = {
  /** Origin of the API, no trailing slash. Empty means same origin. */
  baseUrl: string
  /** The staff token to send, or '' when not logged in. */
  getToken: () => string
  /** Called when the server rejects a token that was sent, so the UI can log out. */
  onUnauthorized: () => void
  fetch?: typeof fetch
}

export type LoginInput = { password: string; firstName: string; lastName: string }

/**
 * A thin, typed wrapper over the HTTP API (see docs/api.md). It holds no state and
 * makes no decisions: every call sends one command and returns what the server says.
 */
export function createApiClient({ baseUrl, getToken, onUnauthorized, fetch: fetcher }: ClientOptions) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken()
    let response: Response

    try {
      response = await (fetcher ?? fetch)(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
    }

    const text = await response.text()
    let payload: unknown = null

    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      if (response.status === 401 && token) {
        onUnauthorized()
      }

      const message = (payload as { message?: unknown } | null)?.message
      throw new ApiError(
        response.status,
        typeof message === 'string' ? message : 'Something went wrong. Please try again.',
      )
    }

    if (payload === null || typeof payload !== 'object') {
      throw new ApiError(response.status, 'The server sent an unexpected response.')
    }

    return payload as T
  }

  return {
    getState: () => request<State>('GET', '/state'),
    getPreviousGame: () => request<PreviousGameResponse>('GET', '/games/previous'),
    signUp: (input: SignupInput) => request<State>('POST', '/players', input),
    login: (input: LoginInput) =>
      request<{ token: string; expiresIn: number }>('POST', '/auth', input),
    patchPlayer: (id: string, patch: PlayerPatch) =>
      request<State>('PATCH', `/players/${encodeURIComponent(id)}`, patch),
    removePlayer: (id: string) => request<State>('DELETE', `/players/${encodeURIComponent(id)}`),
    rebalance: () => request<State>('POST', '/rebalance', {}),
    updateMatch: (input: MatchInput) => request<State>('PUT', '/match', input),
    setAnnouncement: (text: string) => request<State>('PUT', '/match/announcement', { text }),
    setCaptain: (team: TeamKey, playerId: string) =>
      request<State>('PUT', `/captains/${team}`, { playerId }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
