import { DynamoStore } from './store/dynamo.ts'
import { configFromEnv } from './config.ts'
import { createHandler } from './handler.ts'

const tableName = process.env.TABLE_NAME

if (!tableName) {
  throw new Error('TABLE_NAME environment variable is missing.')
}

export const handler = createHandler({
  store: new DynamoStore({ tableName }),
  config: configFromEnv(process.env),
})
