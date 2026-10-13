// One-time migration from the old single "state" item to the current game record.
//
//   node scripts/migrate-state.ts --table bcsoccerclub-state --dry-run
//   node scripts/migrate-state.ts --table bcsoccerclub-state --backup state-backup.json
//
// Moving to a new table (for example the one the CloudFormation stack creates), possibly
// in another region, reads the old item from a different table:
//   node scripts/migrate-state.ts --source-table bcsoccerclub-state --source-region us-east-1 \
//     --table <new table> --region us-west-2
//
// It never deletes or changes the source, writes a backup of the old item first, and
// refuses to run if the new record already exists, so it is safe to run twice.
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { gameSchema } from '../shared/schemas.ts'
import { convertLegacyState } from '../api/migrate/legacy.ts'
import { DynamoStore } from '../api/store/dynamo.ts'

const { values } = parseArgs({
  options: {
    table: { type: 'string' },
    'source-table': { type: 'string' },
    'source-region': { type: 'string' },
    region: { type: 'string', default: process.env.AWS_REGION ?? 'us-east-1' },
    endpoint: { type: 'string' },
    backup: { type: 'string', default: `state-backup-${new Date().toISOString().slice(0, 10)}.json` },
    'dry-run': { type: 'boolean', default: false },
  },
})

if (!values.table) {
  console.error(
    'Usage: node scripts/migrate-state.ts --table <name> [--source-table <name>] [--source-region r] [--dry-run] [--backup file] [--region r] [--endpoint url]',
  )
  process.exit(1)
}

const client = new DynamoDBClient({
  region: values.region,
  ...(values.endpoint ? { endpoint: values.endpoint } : {}),
})
const store = new DynamoStore({ tableName: values.table, client })

// The old record may live in a different table or region than the one being written.
const sourceTable = values['source-table'] ?? values.table
const sourceClient =
  values['source-region'] || values['source-table']
    ? new DynamoDBClient({
        region: values['source-region'] ?? values.region,
        ...(values.endpoint ? { endpoint: values.endpoint } : {}),
      })
    : client

const current = await store.loadCurrent()

if (current.version > 0) {
  console.log(`Nothing to do: the new game record already exists (version ${current.version}).`)
  process.exit(0)
}

const { Item } = await sourceClient.send(
  new GetItemCommand({ TableName: sourceTable, Key: { pk: { S: 'state' } } }),
)

if (!Item?.data?.S) {
  console.log('No old "state" item found; starting from an empty game.')
}

const raw: unknown = Item?.data?.S ? JSON.parse(Item.data.S) : {}
const { game, archived } = convertLegacyState(raw)
gameSchema.parse(game)

console.log(
  `Old state: ${(raw as { players?: unknown[] }).players ? 'found' : 'empty'}. ` +
    `Converted: ${game.players.length} players, ` +
    `date ${game.nextMatchAt ?? 'none'}, ${game.teamCount} teams, ` +
    `previous game ${archived ? archived.id : 'none'}.`,
)

if (values['dry-run']) {
  console.log('Dry run: nothing written. Converted game:')
  console.log(JSON.stringify(game, null, 2))
  process.exit(0)
}

await writeFile(values.backup!, JSON.stringify({ item: Item ?? null, raw }, null, 2))
console.log(`Backup written to ${values.backup}`)

await store.saveCurrent(game, 0, archived ?? undefined)
console.log(`Migrated. The old "state" item in ${sourceTable} was left in place.`)
