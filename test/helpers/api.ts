import type { Config } from '../../api/config.ts'
import { createHandler } from '../../api/handler.ts'
import type { State } from '../../shared/schemas.ts'
import { MemoryStore } from './memoryStore.ts'
import { DAY } from './factories.ts'

export const PASSWORD = 'unit-test-password'
// PBKDF2-SHA256 of PASSWORD (100k iterations).
export const PASSWORD_RECORD =
  'pbkdf2-sha256$100000$dW5pdC10ZXN0LXNhbHQtMQ==$17qjGh5mbtmz3Btab6ksE3iAuJZrKh1wxgsegIH5lhI='
export const SECRET = 'test-secret-test-secret-test-secret-0123'
export const ORIGIN = 'https://club.example'

export type Reply<T = any> = {
  status: number
  headers: Record<string, string>
  body: T
}

/** A real handler wired to an in-memory store and a clock the test controls. */
export function createApi(configOverrides: Partial<Config> = {}) {
  const store = new MemoryStore()
  const clock = { now: Date.parse('2026-10-06T12:00:00Z') }
  let nextId = 0
  const handler = createHandler({
    store,
    config: {
      allowedOrigins: [ORIGIN, 'http://localhost:5173'],
      staffPasswordHash: PASSWORD_RECORD,
      staffAuthSecret: SECRET,
      originSecret: '',
      behindCloudFront: false,
      ...configOverrides,
    },
    now: () => clock.now,
    newId: () => `id-${(nextId += 1)}`,
  })

  async function call(
    method: string,
    path: string,
    options: {
      body?: unknown
      rawBody?: string
      token?: string
      origin?: string
      ip?: string
      headers?: Record<string, string>
    } = {},
  ): Promise<Reply> {
    const response = await handler({
      rawPath: path,
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.origin ? { origin: options.origin } : {}),
        ...options.headers,
      },
      body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      requestContext: { http: { method, sourceIp: options.ip ?? '203.0.113.1' } },
    })

    return {
      status: response.statusCode,
      headers: response.headers,
      body: response.body ? JSON.parse(response.body) : null,
    }
  }

  async function login(firstName = 'Sam', lastName = 'Coach'): Promise<string> {
    const reply = await call('POST', '/auth', { body: { password: PASSWORD, firstName, lastName } })
    if (reply.status !== 200) {
      throw new Error(`login failed: ${JSON.stringify(reply.body)}`)
    }
    return reply.body.token
  }

  const kickoff = () => new Date(clock.now + 3 * DAY).toISOString()

  /** Logs in as staff and sets a game date three days from now. */
  async function openBoard() {
    const token = await login()
    const reply = await call('PUT', '/match', { token, body: { nextMatchAt: kickoff() } })
    return { token, state: reply.body as State }
  }

  const signUp = (firstName: string, skill = 'beginner', ip?: string) =>
    call('POST', '/players', { body: { firstName, lastName: 'Test', skill }, ip })

  return { store, clock, call, login, openBoard, signUp, kickoff }
}
