import assert from 'node:assert/strict'
import test from 'node:test'
import { verifyPasswordRecord } from '../src/auth.js'

const TEST_PASSWORD_RECORD =
  'pbkdf2-sha256$100000$dW5pdC10ZXN0LXNhbHQtMQ==$17qjGh5mbtmz3Btab6ksE3iAuJZrKh1wxgsegIH5lhI='

test('accepts a password through its PBKDF2 hash', async () => {
  assert.equal(
    await verifyPasswordRecord('unit-test-password', TEST_PASSWORD_RECORD),
    true,
  )
})

test('rejects an incorrect staff password', async () => {
  assert.equal(await verifyPasswordRecord('wrong-password', TEST_PASSWORD_RECORD), false)
})

test('rejects malformed or weak password records', async () => {
  assert.equal(await verifyPasswordRecord('anything', 'plain-text'), false)
  assert.equal(
    await verifyPasswordRecord('anything', 'pbkdf2-sha256$100$bad$bad'),
    false,
  )
})
