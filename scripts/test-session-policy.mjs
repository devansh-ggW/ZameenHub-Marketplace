import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { SESSION_TTL_DAYS, SESSION_TTL_MINUTES, SESSION_COOKIE_MAX_AGE_SECONDS } from '../worker/session-policy.ts'

assert.equal(SESSION_TTL_DAYS, 14)
assert.equal(SESSION_TTL_MINUTES, 20_160, 'D1 future() takes minutes')
assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS, 1_209_600, 'Cookie Max-Age takes seconds')
assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS, SESSION_TTL_MINUTES * 60)
assert.equal(SESSION_COOKIE_MAX_AGE_SECONDS / 86_400, SESSION_TTL_DAYS)

const worker = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8')
assert.ok(worker.includes('future(SESSION_TTL_MINUTES)'), 'D1 expiry must use shared minute constant')
assert.equal(worker.split('sessionCookie(token,SESSION_COOKIE_MAX_AGE_SECONDS)').length - 1, 2,
  'Password login and MFA login must use the same cookie duration')
assert.ok(!worker.includes('sessionCookie(token,60*24*14)'), 'Minutes must never be passed directly to cookie Max-Age')
console.log('Session expiry policy tests passed: D1 and browser cookie both expire after 14 days.')
