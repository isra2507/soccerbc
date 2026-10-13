import type { State } from '../../shared/schemas.ts'
import type { CommandContext, CommandResult } from '../rules/commands.ts'
import { rollover, toState } from '../rules/lifecycle.ts'
import { HttpError, conflict } from '../errors.ts'
import { VersionConflict } from '../store.ts'
import type { RouteContext } from './types.ts'

// Each failed attempt means another writer succeeded, so this bounds how many
// people can save at the same instant before one is asked to retry.
const MAX_ATTEMPTS = 15
const jitter = (attempt: number) =>
  new Promise((resolve) => setTimeout(resolve, Math.random() * 15 * (attempt + 1)))

/**
 * Runs one command against the current game and saves it.
 *
 * A finished game is archived first (so the command always acts on a fresh board),
 * and the whole change is saved only if nobody else saved in between; on a
 * conflict it reloads and tries again.
 */
export async function mutate(
  ctx: RouteContext,
  command: (game: Parameters<typeof rollover>[0], commandContext: CommandContext) => CommandResult,
): Promise<State> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { game, version } = await ctx.store.loadCurrent()
    const now = ctx.now()
    const rolled = rollover(game, now)
    const result = command(rolled.game, {
      now,
      newId: ctx.newId,
      actor: ctx.staffName ?? '',
    })
    const archived = result.archived ?? rolled.archived

    try {
      await ctx.store.saveCurrent(result.game, version, archived ?? undefined)
      return toState(result.game, now)
    } catch (error) {
      if (!(error instanceof VersionConflict)) {
        throw error
      }
    }

    await jitter(attempt)
  }

  throw conflict('The roster changed at the same time. Please try again.')
}

export { HttpError }
