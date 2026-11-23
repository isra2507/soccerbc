import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { balanceTeamAssignments } from '../src/teamLogic.js'

// Run the actual handler with an in-memory DynamoDB transport. No AWS calls.
const database = { state: null, revision: 0 }
globalThis.soccerTestDatabase = database
const sdkMock = `
class GetItemCommand { constructor(input) { this.input = input } }
class PutItemCommand { constructor(input) { this.input = input } }
class DynamoDBClient {
  async send(command) {
    const db = globalThis.soccerTestDatabase;
    if (command instanceof GetItemCommand) return { Item: { data: { S: JSON.stringify(db.state) }, revision: { N: String(db.revision) } } };
    db.state = JSON.parse(command.input.Item.data.S);
    db.revision = Number(command.input.Item.revision.N);
    return {};
  }
}
`
const source = (await readFile(new URL('../lambda/bcsoccerclub-api.mjs', import.meta.url), 'utf8'))
  .replace("import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb'", sdkMock)
  .replace('const TABLE_NAME = process.env.TABLE_NAME', "const TABLE_NAME = 'test-table'")
  .replace('const STAFF_AUTH_SECRET = process.env.STAFF_AUTH_SECRET', "const STAFF_AUTH_SECRET = 'test-secret'")
const { handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const payload = Buffer.from(JSON.stringify({ role: 'staff', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
const token = `${payload}.${createHmac('sha256', 'test-secret').update(payload).digest('base64url')}`
const request = (method, path, body, staff = false) => handler({
  httpMethod: method, path,
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: staff ? { authorization: `Bearer ${token}` } : {},
})
function startMatch(teamCount = 2) {
  database.state = { players: [], match: { teamCount, nextMatchAt: '2099-01-01T12:00:00Z' } }
  database.revision = 0
}

test('API rejects signups without a valid required position', async () => {
  startMatch()
  for (const position of [undefined, '', 'unknown']) {
    const response = await request('POST', '/players', { firstName: 'Alex', lastName: 'Test', skill: 'beginner', position })
    assert.equal(response.statusCode, 400)
  }
  assert.equal(database.revision, 0)
})

test('API persists signup positions, spreads extra keepers, and agrees with frontend teams', async () => {
  for (const teamCount of [2, 3, 4]) {
    startMatch(teamCount)
    for (let index = 0; index < 15; index += 1) {
      const response = await request('POST', '/players', {
        id: `player-${index}`, firstName: 'Player', lastName: String(index),
        skill: ['professional', 'beginner', 'intermediate', 'semi-pro'][index % 4],
        position: index < 5 ? 'goalkeeper' : ['defender', 'midfield', 'striker'][index % 3],
        joinedAt: new Date(2026, 0, index + 1).toISOString(),
      })
      assert.equal(response.statusCode, 200)
    }
    const { players } = database.state
    assert.deepEqual(balanceTeamAssignments(players, teamCount), players)
    const keeperCounts = ['penny', 'withoutPenny', 'team3', 'team4'].slice(0, teamCount)
      .map((team) => players.filter((player) => player.team === team && player.position === 'goalkeeper').length)
    assert.ok(Math.max(...keeperCounts) - Math.min(...keeperCounts) <= 1)
    const manualConflict = players.map((player) => ({ ...player, team: 'penny', manualTeam: player.position === 'goalkeeper' }))
    const response = await request('PUT', '/players', manualConflict, true)
    assert.equal(response.statusCode, 200)
    assert.deepEqual(database.state.players, balanceTeamAssignments(manualConflict, teamCount))
  }
})

test('API saves a stats reset without changing the roster or scheduled game', async () => {
  startMatch()
  await request('POST', '/players', { id: 'keeper', firstName: 'Alex', lastName: 'Test', skill: 'beginner', position: 'goalkeeper' })
  const originalPlayers = structuredClone(database.state.players)
  const match = { ...database.state.match, statistics: {
    public: true, players: [{ id: 'alex', name: 'Alex', goals: 0, assists: 0 }],
    lastMatch: { recorded: false, penny: 0, noPenny: 0 },
  } }
  assert.equal((await request('PUT', '/match', match)).statusCode, 401)
  assert.equal((await request('PUT', '/match', match, true)).statusCode, 200)
  const response = await request('GET', '/state')
  assert.deepEqual(JSON.parse(response.body).match.statistics, match.statistics)
  assert.deepEqual(database.state.players, originalPlayers)
  assert.equal(database.state.match.nextMatchAt, match.nextMatchAt)
})

test('API preserves player positions in the previous table after a game expires', async () => {
  startMatch()
  await request('POST', '/players', { firstName: 'Alex', lastName: 'Keeper', skill: 'beginner', position: 'goalkeeper' })
  database.state.match.nextMatchAt = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  const response = await request('GET', '/state')
  const state = JSON.parse(response.body)
  assert.equal(state.players.length, 0)
  assert.equal(state.match.pastGames[0].teams.penny[0].position, 'goalkeeper')
})
