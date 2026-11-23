import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('cloud boards load on open and explicit refresh, with no background polling', async (t) => {
  const listeners = new Map()
  const scheduled = []
  const requests = []
  const state = { players: [], match: { nextMatchAt: '2099-01-01T12:00:00Z' } }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, method: options.method })
    return new Response(JSON.stringify(state))
  })
  const originalWindow = globalThis.window
  globalThis.window = {
    location: { hostname: 'soccer.example' },
    sessionStorage: { getItem: () => null },
    localStorage: { getItem: () => null },
    setInterval: (...args) => scheduled.push(args),
    clearInterval: () => {},
    setTimeout: (...args) => scheduled.push(args),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  }
  t.after(() => { globalThis.window = originalWindow })
  // Compile the Vite environment values for this Node-only store test.
  const source = (await readFile(new URL('../src/dataStore.js', import.meta.url), 'utf8'))
    .replaceAll('import.meta.env', JSON.stringify({ VITE_API_BASE_URL: 'https://api.example', PROD: true }))
    .replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(`../src/${path.slice(2)}`, import.meta.url).href}'`)
  const store = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  let updates = 0
  const unsubscribe = store.subscribeState(() => { updates += 1 }, (error) => { throw error })
  await new Promise(setImmediate)
  assert.equal(updates, 1)
  assert.deepEqual(requests.map((request) => request.method), ['GET'])
  assert.deepEqual(scheduled, [])
  listeners.get('storage')({ key: 'bc-soccer-live-board' })
  await new Promise(setImmediate)
  assert.equal(requests.length, 1)
  await store.addPlayer({ firstName: 'New', lastName: 'Keeper', skill: 'beginner', position: 'goalkeeper' })
  await store.loadState()
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST', 'GET'])
  unsubscribe()
  assert.equal(listeners.size, 0)
  const close = store.subscribeState(() => {}, (error) => { throw error })
  await new Promise(setImmediate)
  assert.equal(requests.length, 4)
  assert.deepEqual(scheduled, [])
  close()
})
