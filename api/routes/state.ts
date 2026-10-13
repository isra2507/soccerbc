import { toPreviousGame, toState } from '../rules/lifecycle.ts'
import { route } from './types.ts'

// Both reads are read-only: a finished game already looks archived without anyone saving it.
export const stateRoutes = [
  route({
    method: 'GET',
    path: '/state',
    access: 'public',
    handle: async (ctx) => {
      const { game } = await ctx.store.loadCurrent()
      return { status: 200, body: toState(game, ctx.now()) }
    },
  }),
  route({
    method: 'GET',
    path: '/games/previous',
    access: 'public',
    handle: async (ctx) => {
      const { game } = await ctx.store.loadCurrent()
      return { status: 200, body: toPreviousGame(game, ctx.now()) }
    },
  }),
]
