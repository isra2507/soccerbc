import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { MIN_SECRET_LENGTH, configFromEnv } from '../api/config.ts'
import { clientIp, type ParsedRequest } from '../api/http.ts'

const request = (overrides: Partial<ParsedRequest>): ParsedRequest => ({
  method: 'GET',
  path: '/',
  origin: '',
  authorization: '',
  ip: '130.176.0.1',
  forwardedFor: '',
  originVerify: '',
  rawBody: '',
  ...overrides,
})

describe('configFromEnv', () => {
  test('accepts a long enough token secret', () => {
    const secret = 'x'.repeat(MIN_SECRET_LENGTH)
    assert.equal(configFromEnv({ STAFF_AUTH_SECRET: secret }).staffAuthSecret, secret)
  })

  test('treats a short token secret as not configured, so staff login is off rather than weak', () => {
    const original = console.error
    console.error = () => {}
    try {
      assert.equal(configFromEnv({ STAFF_AUTH_SECRET: 'short' }).staffAuthSecret, '')
      assert.equal(configFromEnv({ STAFF_AUTH_SECRET: 'x'.repeat(MIN_SECRET_LENGTH - 1) }).staffAuthSecret, '')
    } finally {
      console.error = original
    }
    assert.equal(configFromEnv({}).staffAuthSecret, '')
  })

  test('reads origins, the CloudFront secret and the proxy setting', () => {
    const config = configFromEnv({
      ALLOWED_ORIGINS: ' https://a.example , ,https://b.example',
      ORIGIN_VERIFY_SECRET: 'o',
      BEHIND_CLOUDFRONT: 'true',
    })

    assert.deepEqual(config.allowedOrigins, ['https://a.example', 'https://b.example'])
    assert.equal(config.originSecret, 'o')
    assert.equal(config.behindCloudFront, true)
    assert.equal(configFromEnv({ BEHIND_CLOUDFRONT: 'yes' }).behindCloudFront, false)
  })
})

describe('clientIp', () => {
  test('uses the connecting address when CloudFront is not in front', () => {
    assert.equal(clientIp(request({ ip: '203.0.113.9', forwardedFor: '1.1.1.1, 2.2.2.2' }), false), '203.0.113.9')
  })

  test('behind CloudFront takes the visitor, second from the end', () => {
    assert.equal(clientIp(request({ forwardedFor: '198.51.100.7, 130.176.0.1' }), true), '198.51.100.7')
  })

  test('ignores whatever the visitor put at the front of the chain', () => {
    assert.equal(
      clientIp(request({ forwardedFor: '6.6.6.6, 7.7.7.7, 198.51.100.7, 130.176.0.1' }), true),
      '198.51.100.7',
    )
  })

  test('falls back to the connecting address when the chain is missing or too short', () => {
    assert.equal(clientIp(request({ forwardedFor: '' }), true), '130.176.0.1')
    assert.equal(clientIp(request({ forwardedFor: '198.51.100.7' }), true), '130.176.0.1')
  })
})
