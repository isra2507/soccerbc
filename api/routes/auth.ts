import { authInputSchema } from '../../shared/schemas.ts'
import { TOKEN_LIFETIME_SECONDS, createToken, parsePasswordRecord, passwordMatches } from '../auth.ts'
import { HttpError } from '../errors.ts'
import { route } from './types.ts'

export const authRoutes = [
  route({
    method: 'POST',
    path: '/auth',
    access: 'public',
    limit: 'auth',
    schema: authInputSchema,
    handle: async (ctx, input) => {
      const record = parsePasswordRecord(ctx.config.staffPasswordHash)

      if (!record || !ctx.config.staffAuthSecret) {
        throw new HttpError(500, 'Staff authentication is not configured on the server.')
      }

      if (!passwordMatches(input.password, record)) {
        throw new HttpError(401, 'Wrong staff password.')
      }

      const token = createToken(
        `${input.firstName} ${input.lastName}`,
        ctx.config.staffAuthSecret,
        Math.floor(ctx.now() / 1000),
      )
      return { status: 200, body: { token, expiresIn: TOKEN_LIFETIME_SECONDS } }
    },
  }),
]
