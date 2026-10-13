import type { ZodType } from 'zod'
import type { Config } from './config.ts'
import { HttpError, badRequest } from './errors.ts'

/** The parts of an API Gateway HTTP API (v2) event the API reads. */
export type ApiEvent = {
  rawPath?: string
  headers?: Record<string, string | undefined>
  body?: string | null
  isBase64Encoded?: boolean
  requestContext?: { http?: { method?: string; sourceIp?: string } }
}

export type ApiResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export type ParsedRequest = {
  method: string
  path: string
  origin: string
  authorization: string
  /** The address that connected to API Gateway (CloudFront's, when CloudFront is in front). */
  ip: string
  forwardedFor: string
  originVerify: string
  rawBody: string
}

const MAX_BODY_BYTES = 100_000

export function parseRequest(event: ApiEvent): ParsedRequest {
  const headers = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value ?? '']),
  )
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body
    : ''

  if (rawBody.length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Request body is too large.')
  }

  return {
    method: (event.requestContext?.http?.method ?? 'GET').toUpperCase(),
    path: (event.rawPath ?? '/').replace(/\/+$/, '') || '/',
    origin: headers.origin ?? '',
    authorization: headers.authorization ?? '',
    ip: event.requestContext?.http?.sourceIp ?? 'unknown',
    forwardedFor: headers['x-forwarded-for'] ?? '',
    originVerify: headers['x-origin-verify'] ?? '',
    rawBody,
  }
}

/**
 * The visitor's address, used to rate-limit by person.
 *
 * Directly on API Gateway the connecting address is the visitor. Behind CloudFront it is
 * CloudFront's, and `x-forwarded-for` reads `[anything the visitor sent], visitor, CloudFront`
 * because CloudFront appends the visitor's address and API Gateway then appends its own
 * caller. So the visitor is second from the end, and whatever they sent themselves is ignored.
 * Only trusted when requests are known to come through CloudFront (see `originSecret`).
 */
export function clientIp(request: ParsedRequest, behindCloudFront: boolean): string {
  if (!behindCloudFront) {
    return request.ip
  }

  const chain = request.forwardedFor
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  return chain.length >= 2 ? chain[chain.length - 2]! : request.ip
}

export function corsHeaders(origin: string, config: Config): Record<string, string> {
  const base = {
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  }

  return config.allowedOrigins.includes(origin)
    ? { ...base, 'access-control-allow-origin': origin, vary: 'Origin' }
    : base
}

export function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): ApiResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}

/** Parses a JSON request body and validates it, throwing a 400 with a readable message. */
export function parseBody(rawBody: string, schema: ZodType | undefined): unknown {
  if (!schema) {
    return undefined
  }

  let json: unknown

  try {
    json = rawBody ? JSON.parse(rawBody) : undefined
  } catch {
    throw badRequest('Request body must be valid JSON.')
  }

  const result = schema.safeParse(json)

  if (!result.success) {
    const issue = result.error.issues[0]
    // Only a body of the wrong type gets the generic message; schema rules carry their own.
    const wrongBodyType = issue?.path.length === 0 && issue.code === 'invalid_type'
    throw badRequest(
      !issue || wrongBodyType ? 'Request body must be a JSON object.' : issue.message,
    )
  }

  return result.data
}
