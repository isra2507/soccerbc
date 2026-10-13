import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { GAME_HOLD_MS, MAX_PLAYERS } from '../shared/constants.ts'
import { emptyGame } from '../api/rules/lifecycle.ts'
import { createApi, ORIGIN, PASSWORD } from './helpers/api.ts'
import { DAY, HOUR, makePlayer } from './helpers/factories.ts'

describe('routing and CORS', () => {
  test('answers a preflight request with 204', async () => {
    assert.equal((await createApi().call('OPTIONS', '/players')).status, 204)
  })

  test('404 for unknown paths, 405 for a known path with the wrong method', async () => {
    const api = createApi()

    assert.equal((await api.call('GET', '/nope')).status, 404)
    assert.equal((await api.call('DELETE', '/state')).status, 405)
  })

  test('tolerates a trailing slash', async () => {
    assert.equal((await createApi().call('GET', '/state/')).status, 200)
  })

  test('echoes only allowed origins, and never uses a wildcard', async () => {
    const api = createApi()
    const allowed = await api.call('GET', '/state', { origin: ORIGIN })
    const unknown = await api.call('GET', '/state', { origin: 'https://evil.example' })
    const none = await api.call('OPTIONS', '/state')

    assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN)
    assert.equal(allowed.headers.vary, 'Origin')
    assert.equal(unknown.headers['access-control-allow-origin'], undefined)
    assert.equal(none.headers['access-control-allow-origin'], undefined)
  })

  test('rejects an oversized body with 413', async () => {
    const api = createApi()
    const reply = await api.call('POST', '/players', { rawBody: ' '.repeat(100_001) })

    assert.equal(reply.status, 413)
  })

  test('unexpected failures return a generic 500 and do not leak details', async () => {
    const api = createApi()
    api.store.loadCurrent = async () => {
      throw new Error('secret table name exploded')
    }
    const reply = await api.call('GET', '/state')

    assert.equal(reply.status, 500)
    assert.equal(reply.body.message, 'Server error.')
  })
})

describe('GET /state', () => {
  test('returns an empty board on a fresh install and never writes', async () => {
    const api = createApi()
    const reply = await api.call('GET', '/state')

    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body.players, [])
    assert.equal(reply.body.match.nextMatchAt, null)
    assert.equal(reply.body.match.teamCount, 2)
    assert.equal('previousGame' in reply.body, false)
    assert.equal(api.store.saves, 0)
  })

  test('does not expose staff-only fields', async () => {
    const api = createApi()
    await api.openBoard()
    const { body } = await api.call('GET', '/state')

    assert.equal('manualCaptains' in body.match, false)
    assert.equal('previousGame' in body.match, false)
    assert.equal('previousGame' in body, false)
  })
})

describe('GET /games/previous', () => {
  test('is empty on a fresh install and needs no login', async () => {
    const reply = await createApi().call('GET', '/games/previous')

    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body, { game: null })
  })

  test('returns the finished game for a week, then hides it', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann')
    api.clock.now += 3 * DAY + GAME_HOLD_MS
    const shown = await api.call('GET', '/games/previous')

    assert.equal(shown.body.game.teams.team1[0].firstName, 'Ann')

    api.clock.now += 8 * DAY
    assert.deepEqual((await api.call('GET', '/games/previous')).body, { game: null })
  })

  test('never writes', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann')
    api.clock.now += 3 * DAY + GAME_HOLD_MS
    const saves = api.store.saves
    await api.call('GET', '/games/previous')

    assert.equal(api.store.saves, saves)
  })
})

describe('error messages the UI shows', () => {
  test('give the specific reason for each rejected input', async () => {
    const api = createApi()
    const { token } = await api.openBoard()
    const id = (await api.signUp('Ann')).body.players[0].id
    const message = async (reply: Promise<{ status: number; body: any }>) => {
      const { status, body } = await reply
      assert.equal(status, 400)
      return body.message
    }

    assert.equal(await message(api.call('PATCH', `/players/${id}`, { token, body: {} })), 'Nothing to change.')
    assert.equal(await message(api.call('PUT', '/match', { token, body: {} })), 'Nothing to change.')
    assert.equal(await message(api.call('PUT', '/match', { token, body: { teamCount: 9 } })), 'Choose 2, 3 or 4 teams.')
    assert.equal(await message(api.call('PUT', '/match', { token, body: { nextMatchAt: 'soon' } })), 'Enter a valid date and time.')
    assert.equal(await message(api.call('PUT', '/match/announcement', { token, body: {} })), 'Announcement text is required.')
    assert.equal(await message(api.call('PUT', '/captains/team1', { token, body: {} })), 'Choose a player.')
    assert.equal(await message(api.call('PATCH', `/players/${id}`, { token, body: { team: 'nope' } })), 'Unknown team.')
    assert.equal(await message(api.call('POST', '/players', { body: { lastName: 'T', skill: 'beginner' } })), 'A name is required.')
  })

  test('a body that is not a JSON object says so', async () => {
    const api = createApi()
    await api.openBoard()

    for (const options of [{ body: [] }, { body: null }, {}]) {
      const reply = await api.call('POST', '/players', options)
      assert.equal(reply.body.message, 'Request body must be a JSON object.')
    }
  })
})

describe('authentication', () => {
  test('rejects a wrong password and accepts the right one', async () => {
    const api = createApi()
    const person = { firstName: 'Sam', lastName: 'Coach' }

    assert.equal((await api.call('POST', '/auth', { body: { password: 'nope', ...person } })).status, 401)
    const ok = await api.call('POST', '/auth', { body: { password: PASSWORD, ...person } })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.expiresIn, 8 * 60 * 60)
    assert.match(ok.body.token, /^[\w-]+\.[\w-]+$/)
  })

  test('requires the staff name', async () => {
    const reply = await createApi().call('POST', '/auth', { body: { password: PASSWORD } })
    assert.equal(reply.status, 400)
  })

  test('records the logged-in name, not anything the client claims', async () => {
    const api = createApi()
    const token = await api.login('Ada', 'Lovelace')
    const reply = await api.call('PUT', '/match', {
      token,
      body: { nextMatchAt: api.kickoff(), updatedBy: 'Someone Else' },
    })

    assert.equal(reply.body.match.updatedBy, 'Ada Lovelace')
  })

  test('rejects a forged, tampered, expired or garbage token', async () => {
    const api = createApi()
    const token = await api.login()
    const [, signature] = token.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ role: 'staff', name: 'Mallory', exp: 4102444800 }),
    ).toString('base64url')
    const attempt = (candidate: string) =>
      api.call('PUT', '/match', { token: candidate, body: { teamCount: 3 } })

    assert.equal((await attempt('bad.token')).status, 401)
    assert.equal((await attempt('garbage')).status, 401)
    assert.equal((await attempt(`${forgedPayload}.${signature}`)).status, 401)

    api.clock.now += 9 * HOUR
    assert.equal((await attempt(token)).status, 401)
  })
})

describe('authorization matrix', () => {
  const staffOnly: [string, string, unknown?][] = [
    ['PATCH', '/players/id-1', { skill: 'beginner' }],
    ['DELETE', '/players/id-1'],
    ['POST', '/rebalance', {}],
    ['PUT', '/match', { teamCount: 3 }],
    ['PUT', '/match/announcement', { text: 'hi' }],
    ['PUT', '/captains/team1', { playerId: '' }],
  ]

  for (const [method, path, body] of staffOnly) {
    test(`${method} ${path} needs a staff token`, async () => {
      const api = createApi()
      assert.equal((await api.call(method, path, { body })).status, 401)
      assert.equal((await api.call(method, path, { body, token: 'x.y' })).status, 401)
    })
  }

  test('public routes work without a token', async () => {
    const api = createApi()
    await api.openBoard()

    assert.equal((await api.call('GET', '/state')).status, 200)
    assert.equal((await api.signUp('Ann')).status, 200)
  })
})

describe('POST /players (public sign-up)', () => {
  test('is closed until staff sets a date', async () => {
    const reply = await createApi().signUp('Ann')

    assert.equal(reply.status, 400)
    assert.match(reply.body.message, /Registration opens/)
  })

  test('adds a player, assigns a team and a captain, and keeps updatedBy unchanged', async () => {
    const api = createApi()
    await api.openBoard()
    const reply = await api.signUp('Ann', 'professional')

    assert.equal(reply.status, 200)
    assert.equal(reply.body.players.length, 1)
    assert.equal(reply.body.players[0].team, 'team1')
    assert.equal(reply.body.match.captains.team1, reply.body.players[0].id)
    assert.equal(reply.body.match.updatedBy, 'Sam Coach')
  })

  test('the server chooses id, join time and team; a client cannot overwrite another player', async () => {
    const api = createApi()
    await api.openBoard()
    const first = await api.signUp('Victim', 'professional')
    const victimId = first.body.players[0].id
    const reply = await api.call('POST', '/players', {
      body: {
        firstName: 'Attacker',
        lastName: 'Test',
        skill: 'beginner',
        id: victimId,
        joinedAt: '1999-01-01T00:00:00Z',
        team: 'team4',
        manualTeam: true,
      },
    })

    assert.equal(reply.body.players.length, 2)
    const victim = reply.body.players.find((p: any) => p.id === victimId)
    const attacker = reply.body.players.find((p: any) => p.firstName === 'Attacker')
    assert.equal(victim.firstName, 'Victim')
    assert.notEqual(attacker.id, victimId)
    assert.equal(attacker.manualTeam, false)
    assert.ok(attacker.joinedAt > '2026')
  })

  test('balances equal counts and skill across two teams', async () => {
    const api = createApi()
    await api.openBoard()
    let last
    for (const [name, skill] of [['A', 'professional'], ['B', 'professional'], ['C', 'beginner'], ['D', 'beginner']] as const) {
      last = await api.signUp(name, skill)
    }
    const teams = Object.groupBy(last!.body.players as any[], (p) => p.team)

    assert.equal(teams.team1!.length, 2)
    assert.equal(teams.team2!.length, 2)
  })

  test('validates names, skill and JSON', async () => {
    const api = createApi()
    await api.openBoard()
    const bad = async (body: unknown, expected = 400) =>
      assert.equal((await api.call('POST', '/players', { body })).status, expected, JSON.stringify(body))

    await bad({ firstName: 'x'.repeat(41), lastName: 'T', skill: 'beginner' })
    await bad({ firstName: 'bad\u0007', lastName: 'T', skill: 'beginner' })
    await bad({ firstName: 'Ann', lastName: '   ', skill: 'beginner' })
    await bad({ firstName: 'Ann', lastName: 'T' })
    await bad({ firstName: 'Ann', lastName: 'T', skill: 'god-tier' })
    await bad({ firstName: 'Ann', lastName: 'T', skill: '__proto__' })
    await bad({ firstName: 123, lastName: 'T', skill: 'beginner' })
    await bad(null)
    assert.equal((await api.call('POST', '/players', { rawBody: '{not json' })).status, 400)
  })

  test('collapses whitespace in names', async () => {
    const api = createApi()
    await api.openBoard()
    const reply = await api.call('POST', '/players', {
      body: { firstName: '  Ann   Marie ', lastName: 'Test', skill: 'beginner' },
    })

    assert.equal(reply.body.players[0].firstName, 'Ann Marie')
  })

  test('rejects duplicate names case-insensitively', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann')
    const reply = await api.call('POST', '/players', {
      body: { firstName: 'ANN', lastName: 'test', skill: 'professional' },
    })

    assert.equal(reply.status, 409)
    assert.match(reply.body.message, /already on the list/)
  })

  test('stops at the roster cap', async () => {
    const api = createApi()
    await api.openBoard()
    const loaded = await api.store.loadCurrent()
    api.store.game = {
      ...loaded.game,
      players: Array.from({ length: MAX_PLAYERS }, (_, i) => makePlayer(i + 1)),
    }
    const reply = await api.signUp('Late')

    assert.equal(reply.status, 409)
    assert.match(reply.body.message, /roster is full/)
  })
})

describe('staff commands', () => {
  async function boardWith(names: string[]) {
    const api = createApi()
    const { token } = await api.openBoard()
    let state
    for (const name of names) {
      state = (await api.signUp(name, 'beginner', `10.0.0.${names.indexOf(name)}`)).body
    }
    return { api, token, state }
  }

  test('PATCH moves a player and locks them to that team', async () => {
    const { api, token, state } = await boardWith(['A', 'B', 'C', 'D'])
    const mover = state.players.find((p: any) => p.team === 'team1')
    const reply = await api.call('PATCH', `/players/${mover.id}`, { token, body: { team: 'team2' } })
    const moved = reply.body.players.find((p: any) => p.id === mover.id)

    assert.equal(moved.team, 'team2')
    assert.equal(moved.manualTeam, true)
    assert.equal(moved.updatedBy, 'Sam Coach')
  })

  test('PATCH rejects an unused team, an unknown player, and a rename onto an existing name', async () => {
    const { api, token, state } = await boardWith(['A', 'B'])
    const [a, b] = state.players

    assert.equal((await api.call('PATCH', `/players/${a.id}`, { token, body: { team: 'team4' } })).status, 400)
    assert.equal((await api.call('PATCH', '/players/ghost', { token, body: { skill: 'beginner' } })).status, 404)
    assert.equal((await api.call('PATCH', `/players/${a.id}`, { token, body: { firstName: b.firstName } })).status, 409)
    assert.equal((await api.call('PATCH', `/players/${a.id}`, { token, body: {} })).status, 400)
  })

  test('changing a skill rebalances the teams', async () => {
    const { api, token, state } = await boardWith(['A', 'B', 'C', 'D'])
    const reply = await api.call('PATCH', `/players/${state.players[0].id}`, {
      token,
      body: { skill: 'professional' },
    })
    const counts = Object.values(Object.groupBy(reply.body.players as any[], (p) => p.team)).map((t) => t!.length)

    assert.deepEqual(counts, [2, 2])
  })

  test('DELETE removes a player and rebalances', async () => {
    const { api, token, state } = await boardWith(['A', 'B', 'C'])
    const reply = await api.call('DELETE', `/players/${state.players[0].id}`, { token })

    assert.equal(reply.body.players.length, 2)
    assert.equal((await api.call('DELETE', '/players/ghost', { token })).status, 404)
  })

  test('POST /rebalance releases every manual move', async () => {
    const { api, token, state } = await boardWith(['A', 'B', 'C', 'D'])
    await api.call('PATCH', `/players/${state.players[0].id}`, { token, body: { team: 'team2' } })
    const reply = await api.call('POST', '/rebalance', { token, body: {} })

    assert.ok(reply.body.players.every((p: any) => !p.manualTeam))
  })

  test('changing the team count rebalances everyone onto the new teams', async () => {
    const { api, token } = await boardWith(['A', 'B', 'C', 'D'])
    const reply = await api.call('PUT', '/match', { token, body: { teamCount: 4 } })

    assert.equal(reply.body.match.teamCount, 4)
    assert.deepEqual(reply.body.players.map((p: any) => p.team).sort(), ['team1', 'team2', 'team3', 'team4'])
    assert.equal((await api.call('PUT', '/match', { token, body: { teamCount: 9 } })).status, 400)
  })

  test('captain: staff can choose one, it sticks, and clearing returns to automatic', async () => {
    const { api, token } = await boardWith(['A', 'B'])
    const before = (await api.call('GET', '/state')).body
    const other = before.players.find((p: any) => p.team === 'team1')
    const sticky = await api.call('PUT', '/captains/team1', { token, body: { playerId: other.id } })
    await api.signUp('Newcomer', 'professional', '10.9.9.9')
    const after = (await api.call('GET', '/state')).body

    assert.equal(sticky.body.match.captains.team1, other.id)
    assert.equal(after.match.captains.team1, other.id)

    const cleared = await api.call('PUT', '/captains/team1', { token, body: { playerId: '' } })
    assert.notEqual(cleared.body.match.captains.team1, '')
  })

  test('captain: must be a player on that team, on a team in use', async () => {
    const { api, token, state } = await boardWith(['A', 'B'])
    const onTeam1 = state.players.find((p: any) => p.team === 'team1')

    assert.equal((await api.call('PUT', '/captains/team2', { token, body: { playerId: onTeam1.id } })).status, 400)
    assert.equal((await api.call('PUT', '/captains/team4', { token, body: { playerId: '' } })).status, 400)
    assert.equal((await api.call('PUT', '/captains/nonsense', { token, body: { playerId: '' } })).status, 400)
  })

  test('announcement: trimmed, length-limited, needs a date, and can be removed', async () => {
    const api = createApi()
    const token = await api.login()
    const set = (text: string) => api.call('PUT', '/match/announcement', { token, body: { text } })

    assert.equal((await set('hello')).status, 400)
    await api.call('PUT', '/match', { token, body: { nextMatchAt: api.kickoff() } })
    assert.equal((await set('  Bring water  ')).body.match.announcement, 'Bring water')
    assert.equal((await set('x'.repeat(1001))).status, 400)
    assert.equal((await set('')).body.match.announcement, '')
  })
})

describe('changing the date', () => {
  test('a new date before kickoff starts a fresh table without a bogus history entry', async () => {
    const api = createApi()
    const { token } = await api.openBoard()
    await api.signUp('Ann')
    const later = new Date(api.clock.now + 5 * DAY).toISOString()
    const reply = await api.call('PUT', '/match', { token, body: { nextMatchAt: later } })

    assert.deepEqual(reply.body.players, [])
    assert.equal(reply.body.match.nextMatchAt, later)
    assert.deepEqual((await api.call('GET', '/games/previous')).body, { game: null })
    assert.equal(api.store.archives.size, 0)
  })

  test('rejects a date that has already passed, and an invalid date', async () => {
    const api = createApi()
    const token = await api.login()
    const past = new Date(api.clock.now - DAY).toISOString()

    assert.equal((await api.call('PUT', '/match', { token, body: { nextMatchAt: past } })).status, 400)
    assert.equal((await api.call('PUT', '/match', { token, body: { nextMatchAt: 'soon' } })).status, 400)
  })

  test('null clears the date', async () => {
    const api = createApi()
    const { token } = await api.openBoard()
    const reply = await api.call('PUT', '/match', { token, body: { nextMatchAt: null } })

    assert.equal(reply.body.match.nextMatchAt, null)
  })

  test('setting the same date again changes nothing', async () => {
    const api = createApi()
    const { token } = await api.openBoard()
    await api.signUp('Ann')
    const reply = await api.call('PUT', '/match', { token, body: { nextMatchAt: api.kickoff() } })

    assert.equal(reply.body.players.length, 1)
  })
})

describe('game lifecycle', () => {
  test('after kickoff + 3h readers see an archived game, and reading writes nothing', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann', 'professional')
    const saves = api.store.saves
    api.clock.now += 3 * DAY + GAME_HOLD_MS

    const reply = await api.call('GET', '/state')

    assert.deepEqual(reply.body.players, [])
    assert.equal(reply.body.match.nextMatchAt, null)
    const previous = await api.call('GET', '/games/previous')
    assert.equal(previous.body.game.teams.team1.length, 1)
    assert.equal(api.store.saves, saves)
  })

  test('the board stays up until exactly kickoff + 3h', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann')
    api.clock.now += 3 * DAY + GAME_HOLD_MS - 1

    assert.equal((await api.call('GET', '/state')).body.players.length, 1)
  })

  test('sign-up is closed after the game until staff set a new date', async () => {
    const api = createApi()
    await api.openBoard()
    await api.signUp('Ann')
    api.clock.now += 3 * DAY + GAME_HOLD_MS

    assert.equal((await api.signUp('Late')).status, 400)
  })

  test('the next staff action persists the archive exactly once', async () => {
    const api = createApi()
    const { token } = await api.openBoard()
    await api.signUp('Ann')
    api.clock.now += 3 * DAY + GAME_HOLD_MS
    const next = new Date(api.clock.now + 4 * DAY).toISOString()

    const reply = await api.call('PUT', '/match', { token: await api.login(), body: { nextMatchAt: next } })
    void token

    assert.equal(api.store.archives.size, 1)
    assert.equal(reply.body.match.nextMatchAt, next)
    const previous = await api.call('GET', '/games/previous')
    assert.equal(previous.body.game.teams.team1[0].firstName, 'Ann')
    assert.deepEqual(reply.body.players, [])
  })

  test('a stored empty game is valid and readable', async () => {
    const api = createApi()
    api.store.game = emptyGame()
    assert.equal((await api.call('GET', '/state')).status, 200)
  })
})

describe('concurrent writes', () => {
  test('a sign-up retries through conflicts', async () => {
    const api = createApi()
    await api.openBoard()
    api.store.conflictsToInject = 2
    const reply = await api.signUp('Ann')

    assert.equal(reply.status, 200)
    assert.equal(reply.body.players.length, 1)
  })

  test('gives up with a retryable 409 after repeated conflicts', async () => {
    const api = createApi()
    await api.openBoard()
    api.store.conflictsToInject = 1000
    const reply = await api.signUp('Ann')

    assert.equal(reply.status, 409)
    assert.match(reply.body.message, /try again/)
  })

  test('parallel sign-ups never lose a player', async () => {
    const api = createApi()
    await api.openBoard()
    const names = Array.from({ length: 12 }, (_, i) => `Racer${i}`)
    await Promise.all(names.map((name, i) => api.signUp(name, 'beginner', `10.1.0.${i}`)))
    const { players } = (await api.call('GET', '/state')).body

    assert.equal(players.length, 12)
    assert.equal(new Set(players.map((p: any) => p.id)).size, 12)
  })
})

describe('rate limiting', () => {
  test('blocks staff login after 10 attempts from one IP, but not other IPs', async () => {
    const api = createApi()
    const attempt = (ip: string, password = 'wrong') =>
      api.call('POST', '/auth', { body: { password, firstName: 'A', lastName: 'B' }, ip })

    for (let i = 0; i < 10; i += 1) {
      assert.equal((await attempt('198.51.100.1')).status, 401)
    }
    const blocked = await attempt('198.51.100.1', PASSWORD)

    assert.equal(blocked.status, 429)
    assert.ok(Number(blocked.headers['retry-after']) > 0)
    assert.equal((await attempt('198.51.100.2', PASSWORD)).status, 200)
  })

  test('the window resets over time', async () => {
    const api = createApi()
    const attempt = () =>
      api.call('POST', '/auth', { body: { password: 'wrong', firstName: 'A', lastName: 'B' } })

    for (let i = 0; i < 11; i += 1) {
      await attempt()
    }
    assert.equal((await attempt()).status, 429)
    api.clock.now += 16 * 60 * 1000
    assert.equal((await attempt()).status, 401)
  })

  test('blocks sign-up floods from one IP', async () => {
    const api = createApi()
    await api.openBoard()
    let status = 0
    for (let i = 0; i < 31; i += 1) {
      status = (await api.signUp(`N${i}`)).status
    }

    assert.equal(status, 429)
  })

  test('fails open when the counter is unavailable', async () => {
    const api = createApi()
    await api.openBoard()
    api.store.failCounters = true
    const original = console.error
    console.error = () => {}
    try {
      assert.equal((await api.signUp('Ann')).status, 200)
    } finally {
      console.error = original
    }
  })
})

describe('behind CloudFront', () => {
  const SECRET_HEADER = 'x-origin-verify'
  const secret = 'origin-secret-origin-secret-origin-secret-1'
  const behind = () => createApi({ originSecret: secret, behindCloudFront: true })

  test('refuses requests that did not come through CloudFront', async () => {
    const api = behind()

    assert.equal((await api.call('GET', '/state')).status, 403)
    assert.equal((await api.call('GET', '/state', { headers: { [SECRET_HEADER]: 'guess' } })).status, 403)
    assert.equal((await api.call('OPTIONS', '/state')).status, 403)
    assert.equal((await api.call('POST', '/auth', { body: { password: PASSWORD, firstName: 'A', lastName: 'B' } })).status, 403)
  })

  test('accepts requests that carry the secret CloudFront adds', async () => {
    const api = behind()
    const through = { headers: { [SECRET_HEADER]: secret } }

    assert.equal((await api.call('GET', '/state', through)).status, 200)
    assert.equal((await api.call('OPTIONS', '/state', through)).status, 204)
  })

  test('rate-limits each visitor separately even though CloudFront is the caller', async () => {
    const api = behind()
    const login = (visitor: string, password: string) =>
      api.call('POST', '/auth', {
        body: { password, firstName: 'A', lastName: 'B' },
        ip: '130.176.0.1', // CloudFront's address, the same for everyone
        headers: { [SECRET_HEADER]: secret, 'x-forwarded-for': `${visitor}, 130.176.0.1` },
      })

    for (let i = 0; i < 10; i += 1) {
      assert.equal((await login('198.51.100.7', 'wrong')).status, 401)
    }

    assert.equal((await login('198.51.100.7', PASSWORD)).status, 429)
    assert.equal((await login('198.51.100.8', PASSWORD)).status, 200)
  })

  test('a visitor cannot dodge the limit by inventing forwarded addresses', async () => {
    const api = behind()
    const attempt = (n: number) =>
      api.call('POST', '/auth', {
        body: { password: 'wrong', firstName: 'A', lastName: 'B' },
        ip: '130.176.0.1',
        // the visitor makes up a different leading address every time
        headers: { [SECRET_HEADER]: secret, 'x-forwarded-for': `10.9.9.${n}, 198.51.100.7, 130.176.0.1` },
      })

    for (let i = 0; i < 10; i += 1) {
      await attempt(i)
    }

    assert.equal((await attempt(99)).status, 429)
  })

  test('outside CloudFront the forwarded-for header is ignored, so it cannot be spoofed', async () => {
    const api = createApi()
    const attempt = (n: number) =>
      api.call('POST', '/auth', {
        body: { password: 'wrong', firstName: 'A', lastName: 'B' },
        ip: '203.0.113.50',
        headers: { 'x-forwarded-for': `10.1.1.${n}, 10.2.2.${n}` },
      })

    for (let i = 0; i < 10; i += 1) {
      await attempt(i)
    }

    assert.equal((await attempt(99)).status, 429)
  })
})
