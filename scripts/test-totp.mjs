import assert from 'node:assert/strict'
import { base32Decode, base32Encode, matchedTotpCounter, totpAtCounter } from '../worker/totp.ts'

const rawSecret = new TextEncoder().encode('12345678901234567890')
const secret = base32Encode(rawSecret)

assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'base32 encoding should match the RFC test secret')
assert.deepEqual([...base32Decode(secret)], [...rawSecret], 'base32 encoding should round-trip')
assert.equal(await totpAtCounter(secret, 0), '755224', 'TOTP counter 0 should match the RFC 4226/HOTP vector')
assert.equal(await totpAtCounter(secret, 1), '287082', 'TOTP counter 1 should match the RFC 4226/HOTP vector')
assert.equal(await matchedTotpCounter(secret, '287082', 59_000), 1, 'the matching 30-second counter should be identified')
assert.equal(await matchedTotpCounter(secret, '287082', 119_000), null, 'a code outside the accepted time window should be rejected')
assert.equal(await matchedTotpCounter(secret, '12x082', 59_000), null, 'malformed codes should be rejected')
assert.throws(() => base32Decode('INVALID!'), /Invalid authenticator secret/, 'invalid base32 secrets should fail closed')

console.log('TOTP vector tests passed.')
