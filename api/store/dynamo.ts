import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { gameSchema, type ArchivedGame, type Game } from '../../shared/schemas.ts'
import { emptyGame } from '../rules/lifecycle.ts'
import { VersionConflict, type Store, type Versioned } from '../store.ts'

const CURRENT_KEY = 'GAME#current'
const NOT_STALE = 'attribute_not_exists(pk) OR #version = :expected'

type DynamoStoreOptions = { tableName: string; client?: DynamoDBClient }

const isConditionalFailure = (error: unknown): boolean => {
  const failure = error as {
    name?: string
    CancellationReasons?: { Code?: string }[]
  }

  return (
    failure?.name === 'ConditionalCheckFailedException' ||
    (failure?.name === 'TransactionCanceledException' &&
      Boolean(failure.CancellationReasons?.some((reason) => reason.Code === 'ConditionalCheckFailed')))
  )
}

export class DynamoStore implements Store {
  private readonly tableName: string
  private readonly client: DynamoDBClient

  constructor({ tableName, client = new DynamoDBClient({}) }: DynamoStoreOptions) {
    this.tableName = tableName
    this.client = client
  }

  async loadCurrent(): Promise<Versioned> {
    const { Item } = await this.client.send(
      new GetItemCommand({ TableName: this.tableName, Key: { pk: { S: CURRENT_KEY } } }),
    )

    if (!Item?.data?.S) {
      return { game: emptyGame(), version: 0 }
    }

    // A malformed record is a deployment/data bug; fail loudly instead of guessing.
    const game = gameSchema.parse(JSON.parse(Item.data.S))
    return { game, version: Number(Item.version?.N ?? 0) }
  }

  async saveCurrent(game: Game, expectedVersion: number, archived?: ArchivedGame): Promise<void> {
    const item = {
      pk: { S: CURRENT_KEY },
      data: { S: JSON.stringify(game) },
      version: { N: String(expectedVersion + 1) },
    }
    const condition = {
      ConditionExpression: NOT_STALE,
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': { N: String(expectedVersion) } },
    }

    try {
      if (!archived) {
        await this.client.send(
          new PutItemCommand({ TableName: this.tableName, Item: item, ...condition }),
        )
        return
      }

      await this.client.send(
        new TransactWriteItemsCommand({
          TransactItems: [
            { Put: { TableName: this.tableName, Item: item, ...condition } },
            {
              // Same id means the same game: replaying a save cannot duplicate history.
              Put: {
                TableName: this.tableName,
                Item: {
                  pk: { S: `ARCHIVE#${archived.id}` },
                  data: { S: JSON.stringify(archived) },
                },
              },
            },
          ],
        }),
      )
    } catch (error) {
      if (isConditionalFailure(error)) {
        throw new VersionConflict()
      }
      throw error
    }
  }

  async incrementCounter(key: string, expiresAt: number): Promise<number> {
    const { Attributes } = await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: { pk: { S: key } },
        UpdateExpression: 'ADD hits :one SET expiresAt = :expiresAt',
        ExpressionAttributeValues: {
          ':one': { N: '1' },
          ':expiresAt': { N: String(expiresAt) },
        },
        ReturnValues: 'UPDATED_NEW',
      }),
    )

    return Number(Attributes?.hits?.N ?? 0)
  }
}
