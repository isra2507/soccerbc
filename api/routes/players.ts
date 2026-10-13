import { z } from 'zod'
import { playerPatchSchema, signupInputSchema } from '../../shared/schemas.ts'
import { patchPlayer, rebalance, removePlayer, signUp } from '../rules/commands.ts'
import { mutate } from './mutate.ts'
import { route } from './types.ts'

export const playerRoutes = [
  route({
    method: 'POST',
    path: '/players',
    access: 'public',
    limit: 'signup',
    schema: signupInputSchema,
    handle: async (ctx, input) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => signUp(game, input, c)),
    }),
  }),
  route({
    method: 'PATCH',
    path: '/players/:id',
    access: 'staff',
    schema: playerPatchSchema,
    handle: async (ctx, patch) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => patchPlayer(game, ctx.params.id!, patch, c)),
    }),
  }),
  route({
    method: 'DELETE',
    path: '/players/:id',
    access: 'staff',
    handle: async (ctx) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => removePlayer(game, ctx.params.id!, c)),
    }),
  }),
  route({
    method: 'POST',
    path: '/rebalance',
    access: 'staff',
    schema: z.unknown(),
    handle: async (ctx) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => rebalance(game, c)),
    }),
  }),
]
