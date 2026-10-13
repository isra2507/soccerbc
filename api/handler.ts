import { randomUUID } from 'node:crypto'
import type { Config } from './config.ts'
import { createHash, timingSafeEqual } from 'node:crypto'
import { verifyToken } from './auth.ts'
import { HttpError } from './errors.ts'
import {
  clientIp,
  corsHeaders,
  jsonResponse,
  parseBody,
  parseRequest,
  type ApiEvent,
  type ApiResponse,
  type ParsedRequest,
} from './http.ts'
import { exceedsRateLimit, RATE_LIMITS } from './rateLimit.ts'
import { authRoutes } from './routes/auth.ts'
import { matchRoutes } from './routes/match.ts'
import { playerRoutes } from './routes/players.ts'
import { stateRoutes } from './routes/state.ts'
import type { Route, Services } from './routes/types.ts'
import type { Store } from './store.ts'

const routes: Route[] = [...stateRoutes, ...authRoutes, ...playerRoutes, ...matchRoutes]

type CompiledRoute = { route: Route; pattern: RegExp; names: string[] }

// Built once when the Lambda starts, not on every request.
const compiledRoutes: CompiledRoute[] = routes.map((route) => {
  const names: string[] = []
  const source = route.path.replace(/:([a-zA-Z]+)/g, (_, name: string) => {
    names.push(name)
    return '([^/]+)'
  })
  return { route, pattern: new RegExp(`^${source}$`), names }
})

type Match = { route: Route; params: Record<string, string> }

function matchRoute(method: string, path: string): { match?: Match; pathKnown: boolean } {
  let pathKnown = false

  for (const { route, pattern, names } of compiledRoutes) {
    const found = pattern.exec(path)

    if (!found) {
      continue
    }

    pathKnown = true

    if (route.method === method) {
      const params = Object.fromEntries(
        names.map((name, index) => [name, decodeURIComponent(found[index + 1]!)]),
      )
      return { match: { route, params }, pathKnown }
    }
  }

  return { pathKnown }
}

function staffNameFrom(request: ParsedRequest, config: Config, nowMs: number): string | null {
  const token = request.authorization.startsWith('Bearer ')
    ? request.authorization.slice('Bearer '.length)
    : ''
  return verifyToken(token, config.staffAuthSecret, Math.floor(nowMs / 1000))?.name ?? null
}

const sha256 = (value: string) => createHash('sha256').update(value).digest()

/** Constant-time check that the request came through CloudFront (which adds the secret). */
const cameThroughCloudFront = (request: ParsedRequest, config: Config) =>
  timingSafeEqual(sha256(request.originVerify), sha256(config.originSecret))

export type HandlerDeps = {
  store: Store
  config: Config
  now?: () => number
  newId?: () => string
}

/** Builds the Lambda handler. Everything it depends on is passed in, so tests can fake it. */
export function createHandler({ store, config, now = Date.now, newId = randomUUID }: HandlerDeps) {
  const services: Services = { store, config, now, newId }

  return async function handler(event: ApiEvent): Promise<ApiResponse> {
    let cors: Record<string, string> = {}

    try {
      const request = parseRequest(event)
      cors = corsHeaders(request.origin, config)

      // Refuse anything that skipped CloudFront before doing any other work.
      if (config.originSecret && !cameThroughCloudFront(request, config)) {
        throw new HttpError(403, 'Forbidden.')
      }

      if (request.method === 'OPTIONS') {
        return jsonResponse(204, null, cors)
      }

      const { match, pathKnown } = matchRoute(request.method, request.path)

      if (!match) {
        throw new HttpError(
          pathKnown ? 405 : 404,
          `No route for ${request.method} ${request.path}.`,
        )
      }

      const { route, params } = match
      let staffName: string | null = null

      if (route.access === 'staff') {
        staffName = staffNameFrom(request, config, now())

        if (!staffName) {
          throw new HttpError(401, 'Staff login is required.')
        }
      }

      if (route.limit && (await exceedsRateLimit(store, route.limit, clientIp(request, config.behindCloudFront), now()))) {
        return jsonResponse(
          429,
          { message: 'Too many attempts. Please wait a few minutes and try again.' },
          { ...cors, 'retry-after': String(RATE_LIMITS[route.limit].windowSeconds) },
        )
      }

      const body = parseBody(request.rawBody, route.schema)
      const result = await route.handle({ ...services, staffName, params }, body)
      return jsonResponse(result.status, result.body, cors)
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse(error.status, { message: error.message }, cors)
      }

      console.error(error)
      return jsonResponse(500, { message: 'Server error.' }, cors)
    }
  }
}
