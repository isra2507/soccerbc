// Runs the API locally: the production handler behind a plain HTTP server, backed by
// DynamoDB Local (docker compose up -d). Mirrors an API Gateway HTTP API event.
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createHandler } from '../api/handler.ts'
import { DynamoStore } from '../api/store/dynamo.ts'

const PORT = Number(process.env.PORT ?? 3001)
const ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'
const TABLE_NAME = 'bcsoccerclub-local'
const STAFF_PASSWORD = process.env.LOCAL_STAFF_PASSWORD ?? 'dev'

const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint: ENDPOINT,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function ensureTable() {
  let lastError: unknown

  // DynamoDB Local can take a few seconds to accept connections after `docker compose up`.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }))
      return
    } catch (error) {
      if ((error as { name?: string }).name === 'ResourceNotFoundException') {
        await client.send(
          new CreateTableCommand({
            TableName: TABLE_NAME,
            BillingMode: 'PAY_PER_REQUEST',
            AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
          }),
        )
        return
      }

      lastError = error
      await sleep(500)
    }
  }

  throw new Error(
    `Cannot reach DynamoDB Local at ${ENDPOINT} (${(lastError as Error)?.message}). Run "docker compose up -d" first.`,
  )
}

await ensureTable()

const salt = randomBytes(16)
const hash = pbkdf2Sync(STAFF_PASSWORD, salt, 100_000, 32, 'sha256')
const store = new DynamoStore({ tableName: TABLE_NAME, client })

// Local development and the browser tests make many requests from one address, so the
// per-IP limits are off unless asked for (RATE_LIMITS=on) to try them out.
if (process.env.RATE_LIMITS !== 'on') {
  store.incrementCounter = async () => 0
}

const handler = createHandler({
  store,
  config: {
    allowedOrigins: (
      process.env.ALLOWED_ORIGINS ??
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173'
    ).split(','),
    staffPasswordHash: `pbkdf2-sha256$100000$${salt.toString('base64')}$${hash.toString('base64')}`,
    staffAuthSecret: randomBytes(48).toString('base64'),
    originSecret: '',
    behindCloudFront: false,
  },
})

createServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(chunk as Buffer)
  }

  const url = new URL(request.url ?? '/', 'http://localhost')
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key] = Array.isArray(value) ? value.join(',') : (value ?? '')
  }

  const result = await handler({
    rawPath: url.pathname,
    headers,
    body: chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined,
    requestContext: {
      http: { method: request.method ?? 'GET', sourceIp: request.socket.remoteAddress ?? 'unknown' },
    },
  })

  response.writeHead(result.statusCode, result.headers)
  response.end(result.body)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Local API on http://localhost:${PORT} (DynamoDB Local ${ENDPOINT})`)
  console.log(`Staff password: ${STAFF_PASSWORD}`)
})
