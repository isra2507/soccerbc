import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { emptyGame } from '../api/rules/lifecycle.ts'
import { VersionConflict, type Store } from '../api/store.ts'
import { makeGame, makePlayers } from './helpers/factories.ts'

/** The behaviour every Store implementation must have. */
export function storeContract(name: string, makeStore: () => Promise<Store> | Store, skip?: string) {
  describe(`Store contract: ${name}`, { skip }, () => {
    test('starts as an empty game at version 0', async () => {
      const store = await makeStore()
      const { game, version } = await store.loadCurrent()

      assert.deepEqual(game, emptyGame())
      assert.equal(version, 0)
    })

    test('saves and reloads a game, advancing the version', async () => {
      const store = await makeStore()
      const game = makeGame({ nextMatchAt: '2026-10-09T18:00:00.000Z', players: makePlayers(5) })

      await store.saveCurrent(game, 0)
      const loaded = await store.loadCurrent()

      assert.deepEqual(loaded.game, game)
      assert.equal(loaded.version, 1)
    })

    test('rejects a save based on an old version', async () => {
      const store = await makeStore()
      await store.saveCurrent(makeGame({ announcement: 'first' }), 0)

      await assert.rejects(store.saveCurrent(makeGame({ announcement: 'stale' }), 0), VersionConflict)
      assert.equal((await store.loadCurrent()).game.announcement, 'first')
    })

    test('rejects creating the game twice from version 0', async () => {
      const store = await makeStore()
      await store.saveCurrent(makeGame(), 0)

      await assert.rejects(store.saveCurrent(makeGame(), 0), VersionConflict)
    })

    test('of many writers racing on one version, exactly one wins', async () => {
      const store = await makeStore()
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          store.saveCurrent(makeGame({ announcement: `writer ${i}` }), 0),
        ),
      )

      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
      assert.ok(
        results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .every((r) => r.reason instanceof VersionConflict),
      )
      assert.equal((await store.loadCurrent()).version, 1)
    })

    test('counters count per key and are independent', async () => {
      const store = await makeStore()
      const expiresAt = Math.floor(Date.now() / 1000) + 600

      assert.equal(await store.incrementCounter('a', expiresAt), 1)
      assert.equal(await store.incrementCounter('a', expiresAt), 2)
      assert.equal(await store.incrementCounter('b', expiresAt), 1)
    })

    test('concurrent counter increments are not lost', async () => {
      const store = await makeStore()
      const expiresAt = Math.floor(Date.now() / 1000) + 600
      const counts = await Promise.all(
        Array.from({ length: 20 }, () => store.incrementCounter('burst', expiresAt)),
      )

      assert.deepEqual([...counts].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1))
    })
  })
}
