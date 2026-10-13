import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { randomUUID } from 'node:crypto'

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'

export const dynamoClient = new DynamoDBClient({
  region: 'us-east-1',
  endpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  maxAttempts: 1,
  requestHandler: { requestTimeout: 2000, connectionTimeout: 1000 },
})

/** Whether DynamoDB Local answers. CI sets REQUIRE_DYNAMODB=1 so a missing one fails loudly. */
export async function dynamoAvailable(): Promise<boolean> {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: 'probe-does-not-exist' }))
    return true
  } catch (error) {
    return (error as { name?: string }).name === 'ResourceNotFoundException'
  }
}

export const skipReason = async (): Promise<string | undefined> => {
  // Give a container that was just started a few seconds to accept connections.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (await dynamoAvailable()) {
      return undefined
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (process.env.REQUIRE_DYNAMODB === '1') {
    throw new Error(`DynamoDB Local is required but not reachable at ${endpoint}.`)
  }

  return `DynamoDB Local is not running at ${endpoint} (npm run dev:api starts it)`
}

/** Creates a uniquely named table with the production key schema. */
export async function createTable(): Promise<{ tableName: string; drop: () => Promise<void> }> {
  const tableName = `test-${randomUUID()}`
  await dynamoClient.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    }),
  )

  return {
    tableName,
    drop: async () => {
      await dynamoClient.send(new DeleteTableCommand({ TableName: tableName }))
    },
  }
}
