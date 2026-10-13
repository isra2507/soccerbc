import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { ApiError, createApiClient } from '../src/lib/client.ts'

type Call = { url: string; init: RequestInit }

function setup(reply: () => Response | Promise<Response>, token = '') {
  const calls: Call[] = []
  let unauthorized = 0
  const client = createApiClient({
    baseUrl: 'https://api.example',
    getToken: () => token,
    onUnauthorized: () => {
      unauthorized += 1
    },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return reply()
    }) as typeof fetch,
  })

  return { client, calls, unauthorizedCount: () => unauthorized }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('requests', () => {
  test('sends each command to the right method and path with a JSON body', async () => {
    const { client, calls } = setup(() => json(200, { players: [], match: {} }), 'tok')

    await client.signUp({ firstName: 'Ann', lastName: 'Lee', skill: 'beginner' })
    await client.patchPlayer('a b', { team: 'team2' })
    await client.removePlayer('x')
    await client.rebalance()
    await client.updateMatch({ teamCount: 3 })
    await client.setAnnouncement('hi')
    await client.setCaptain('team3', 'p1')

    assert.deepEqual(
      calls.map((c) => `${c.init.method} ${c.url.replace('https://api.example', '')}`),
      [
        'POST /players',
        'PATCH /players/a%20b',
        'DELETE /players/x',
        'POST /rebalance',
        'PUT /match',
        'PUT /match/announcement',
        'PUT /captains/team3',
      ],
    )
    assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { firstName: 'Ann', lastName: 'Lee', skill: 'beginner' })
    assert.deepEqual(JSON.parse(calls[5]!.init.body as string), { text: 'hi' })
    assert.equal(calls[2]!.init.body, undefined)
  })

  test('sends the staff token only when there is one', async () => {
    const anonymous = setup(() => json(200, {}))
    const staff = setup(() => json(200, {}), 'secret-token')
    await anonymous.client.getState()
    await staff.client.getState()

    assert.equal((anonymous.calls[0]!.init.headers as Record<string, string>).authorization, undefined)
    assert.equal((staff.calls[0]!.init.headers as Record<string, string>).authorization, 'Bearer secret-token')
  })
})

describe('errors', () => {
  test('shows the server message for a rejected request', async () => {
    const { client } = setup(() => json(409, { message: 'That name is already on the list.' }))

    await assert.rejects(
      client.signUp({ firstName: 'A', lastName: 'B', skill: 'beginner' }),
      (error: ApiError) => error.status === 409 && error.message === 'That name is already on the list.',
    )
  })

  test('logs the user out when a sent token is rejected', async () => {
    const { client, unauthorizedCount } = setup(() => json(401, { message: 'Staff login is required.' }), 'old')
    await assert.rejects(client.rebalance(), (error: ApiError) => error.status === 401)

    assert.equal(unauthorizedCount(), 1)
  })

  test('a wrong password is not treated as an expired session', async () => {
    const { client, unauthorizedCount } = setup(() => json(401, { message: 'Wrong staff password.' }))
    await assert.rejects(
      client.login({ password: 'x', firstName: 'A', lastName: 'B' }),
      (error: ApiError) => error.message === 'Wrong staff password.',
    )

    assert.equal(unauthorizedCount(), 0)
  })

  test('explains a network failure in plain words', async () => {
    const { client } = setup(() => {
      throw new TypeError('Failed to fetch')
    })

    await assert.rejects(
      client.getState(),
      (error: ApiError) => error.status === 0 && /Could not reach the server/.test(error.message),
    )
  })

  test('handles an error body that is not JSON, and a success body that is not an object', async () => {
    const html = setup(() => new Response('<html>502</html>', { status: 502 }))
    await assert.rejects(html.client.getState(), (error: ApiError) => error.message === 'Something went wrong. Please try again.')

    const empty = setup(() => new Response('', { status: 200 }))
    await assert.rejects(empty.client.getState(), (error: ApiError) => error.message === 'The server sent an unexpected response.')
  })
})
