import type { z } from 'zod'
import type { Config } from '../config.ts'
import type { Store } from '../store.ts'
import type { LimitScope } from '../rateLimit.ts'

export type Clock = () => number

export type Services = {
  store: Store
  config: Config
  now: Clock
  newId: () => string
}

export type RouteContext = Services & {
  /** Who is acting. Always set on `access: 'staff'` routes. */
  staffName: string | null
  params: Record<string, string>
}

export type RouteResult = { status: number; body: unknown }

export type Route = {
  method: string
  /** e.g. `/players/:id` */
  path: string
  access: 'public' | 'staff'
  limit?: LimitScope
  schema?: z.ZodType
  handle(ctx: RouteContext, body: unknown): Promise<RouteResult>
}

export function route<S extends z.ZodType | undefined = undefined>(def: {
  method: string
  path: string
  access: 'public' | 'staff'
  limit?: LimitScope
  schema?: S
  handle(ctx: RouteContext, body: S extends z.ZodType ? z.infer<S> : undefined): Promise<RouteResult>
}): Route {
  return def as unknown as Route
}
