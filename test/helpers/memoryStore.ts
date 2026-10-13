import type { ArchivedGame, Game } from '../../shared/schemas.ts'
import { emptyGame } from '../../api/rules/lifecycle.ts'
import { VersionConflict, type Store, type Versioned } from '../../api/store.ts'

/** Test double for Store. test/store.contract.ts proves it behaves like the real one. */
export class MemoryStore implements Store {
  game: Game = emptyGame()
  version = 0
  archives = new Map<string, ArchivedGame>()
  counters = new Map<string, number>()
  /** Number of upcoming saves that should fail with a conflict. */
  conflictsToInject = 0
  failCounters = false
  saves = 0

  async loadCurrent(): Promise<Versioned> {
    return { game: structuredClone(this.game), version: this.version }
  }

  async saveCurrent(game: Game, expectedVersion: number, archived?: ArchivedGame): Promise<void> {
    if (this.conflictsToInject > 0) {
      this.conflictsToInject -= 1
      throw new VersionConflict()
    }

    if (expectedVersion !== this.version) {
      throw new VersionConflict()
    }

    this.game = structuredClone(game)
    this.version += 1
    this.saves += 1

    if (archived) {
      this.archives.set(archived.id, structuredClone(archived))
    }
  }

  async incrementCounter(key: string): Promise<number> {
    if (this.failCounters) {
      throw new Error('counter table unavailable')
    }

    const hits = (this.counters.get(key) ?? 0) + 1
    this.counters.set(key, hits)
    return hits
  }
}
