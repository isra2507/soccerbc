import {
  announcementInputSchema,
  captainInputSchema,
  matchInputSchema,
  teamKeySchema,
} from '../../shared/schemas.ts'
import { badRequest } from '../errors.ts'
import { setAnnouncement, setCaptain, setMatch } from '../rules/commands.ts'
import { mutate } from './mutate.ts'
import { route } from './types.ts'

export const matchRoutes = [
  route({
    method: 'PUT',
    path: '/match',
    access: 'staff',
    schema: matchInputSchema,
    handle: async (ctx, input) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => setMatch(game, input, c)),
    }),
  }),
  route({
    method: 'PUT',
    path: '/match/announcement',
    access: 'staff',
    schema: announcementInputSchema,
    handle: async (ctx, input) => ({
      status: 200,
      body: await mutate(ctx, (game, c) => setAnnouncement(game, input.text, c)),
    }),
  }),
  route({
    method: 'PUT',
    path: '/captains/:team',
    access: 'staff',
    schema: captainInputSchema,
    handle: async (ctx, input) => {
      const team = teamKeySchema.safeParse(ctx.params.team)

      if (!team.success) {
        throw badRequest('Unknown team.')
      }

      return {
        status: 200,
        body: await mutate(ctx, (game, c) => setCaptain(game, team.data, input.playerId, c)),
      }
    },
  }),
]
