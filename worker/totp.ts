const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(value: Uint8Array): string {
  let bits = 0, buffer = 0, output = ''
  for (const byte of value) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += BASE32[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) output += BASE32[(buffer << (5 - bits)) & 31]
  return output
}

export function base32Decode(value: string): Uint8Array {
  const source = value.toUpperCase().replace(/=+$/,'').replace(/\s/g,'')
  let bits = 0, buffer = 0
  const output: number[] = []
  for (const character of source) {
    const digit = BASE32.indexOf(character)
    if (digit < 0) throw new Error('Invalid authenticator secret')
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      output.push((buffer >> bits) & 255)
    }
  }
  return new Uint8Array(output)
}

export async function totpAtCounter(secret: string, counter: number): Promise<string> {
  if (!Number.isSafeInteger(counter) || counter < 0) throw new Error('Invalid TOTP counter')
  let remaining = counter
  const message = new Uint8Array(8)
  for (let index = 7; index >= 0; index--) {
    message[index] = remaining % 256
    remaining = Math.floor(remaining / 256)
  }
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const offset = mac[mac.length - 1] & 15
  const binary = ((mac[offset] & 127) << 24)
    | ((mac[offset + 1] & 255) << 16)
    | ((mac[offset + 2] & 255) << 8)
    | (mac[offset + 3] & 255)
  return String(binary % 1_000_000).padStart(6, '0')
}

export async function matchedTotpCounter(secret: string, value: unknown, timestamp = Date.now()): Promise<number | null> {
  const code = typeof value === 'string' ? value.trim().slice(0, 20).replace(/\s/g, '') : ''
  if (!/^\d{6}$/.test(code) || !Number.isFinite(timestamp)) return null
  const current = Math.floor(timestamp / 30_000)
  for (const offset of [-1, 0, 1]) {
    const counter = current + offset
    if (counter >= 0 && await totpAtCounter(secret, counter) === code) return counter
  }
  return null
}
