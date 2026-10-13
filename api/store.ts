import type { ArchivedGame, Game } from '../shared/schemas.ts'

/** Another writer saved a newer version first; reload and try again. */
export class VersionConflict extends Error {
  constructor() {
    super('The game was changed by someone else.')
    this.name = 'VersionConflict'
  }
}

export type Versioned = { game: Game; version: number }

/**
 * Everything the API needs from a database. Routes and rules only ever see this
 * interface; `store/dynamo.ts` is the DynamoDB implementation.
 */
export interface Store {
  /** The current game and its version (an empty game at version 0 if none exists). */
  loadCurrent(): Promise<Versioned>

  /**
   * Saves the current game only if it is still at `expectedVersion`, otherwise
   * throws VersionConflict. When given, `archived` is stored permanently in the
   * same atomic write.
   */
  saveCurrent(game: Game, expectedVersion: number, archived?: ArchivedGame): Promise<void>

  /** Adds one to a named counter that expires at `expiresAt` (epoch seconds). */
  incrementCounter(key: string, expiresAt: number): Promise<number>
}
