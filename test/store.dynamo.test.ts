import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'
import { GetItemCommand } from '@aws-sdk/client-dynamodb'
import { VersionConflict } from '../api/store.ts'
import { DynamoStore } from '../api/store/dynamo.ts'
import { snapshotGame } from '../api/rules/lifecycle.ts'
import { createTable, dynamoClient, skipReason } from './helpers/dynamoLocal.ts'
import { makeGame, makePlayers } from './helpers/factories.ts'
import { storeContract } from './store.contract.ts'

const skip = await skipReason()
const tables: (() => Promise<void>)[] = []

const freshStore = async () => {
  const { tableName, drop } = await createTable()
  tables.push(drop)
  return { store: new DynamoStore({ tableName, client: dynamoClient }), tableName }
}

after(async () => {
  await Promise.all(tables.map((drop) => drop()))
})

storeContract('DynamoStore (DynamoDB Local)', async () => (await freshStore()).store, skip)

describe('DynamoStore specifics', { skip }, () => {
  const playedGame = () =>
    makeGame({
      nextMatchAt: '2026-10-09T18:00:00.000Z',
      players: makePlayers(4).map((p, i) => ({ ...p, team: i % 2 ? 'team2' : 'team1' })),
    })

  const archiveExists = async (tableName: string, id: string) =>
    Boolean(
      (
        await dynamoClient.send(
          new GetItemCommand({ TableName: tableName, Key: { pk: { S: `ARCHIVE#${id}` } } }),
        )
      ).Item,
    )

  test('writes the archive together with the new game', async () => {
    const { store, tableName } = await freshStore()
    const game = playedGame()
    const archived = snapshotGame(game, Date.parse('2026-10-09T22:00:00Z'))!

    await store.saveCurrent(makeGame({ previousGame: archived }), 0, archived)

    assert.equal(await archiveExists(tableName, archived.id), true)
    assert.equal((await store.loadCurrent()).game.previousGame?.id, archived.id)
  })

  test('writes neither the game nor the archive when the version is stale', async () => {
    const { store, tableName } = await freshStore()
    await store.saveCurrent(makeGame({ announcement: 'current' }), 0)
    const archived = snapshotGame(playedGame(), Date.parse('2026-10-09T22:00:00Z'))!

    await assert.rejects(
      store.saveCurrent(makeGame({ announcement: 'stale' }), 0, archived),
      VersionConflict,
    )

    assert.equal(await archiveExists(tableName, archived.id), false)
    assert.equal((await store.loadCurrent()).game.announcement, 'current')
  })

  test('replaying an archive write does not duplicate history', async () => {
    const { store } = await freshStore()
    const archived = snapshotGame(playedGame(), Date.parse('2026-10-09T22:00:00Z'))!

    await store.saveCurrent(makeGame(), 0, archived)
    await store.saveCurrent(makeGame(), 1, archived)

    assert.equal((await store.loadCurrent()).version, 2)
  })

  test('refuses to load a corrupted record instead of guessing', async () => {
    const { store, tableName } = await freshStore()
    const { PutItemCommand } = await import('@aws-sdk/client-dynamodb')
    await dynamoClient.send(
      new PutItemCommand({
        TableName: tableName,
        Item: { pk: { S: 'GAME#current' }, data: { S: '{"players":"nope"}' }, version: { N: '3' } },
      }),
    )

    await assert.rejects(store.loadCurrent())
  })
})
