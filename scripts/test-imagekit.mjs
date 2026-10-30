import assert from 'node:assert/strict'
import { readValidatedImage, uploadImageKitImage, deleteImageKitFile } from '../worker/imagekit.ts'

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0])
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

function requestWithFile(bytes, mimeType, name = 'photo.bin') {
  const file = new File([bytes], name, { type: mimeType })
  const form = new FormData()
  form.append('file', file, name)
  return new Request('https://example.test/api/upload', { method: 'POST', body: form })
}

for (const [bytes, mimeType, extension] of [
  [jpeg, 'image/jpeg', 'jpg'],
  [png, 'image/png', 'png'],
  [webp, 'image/webp', 'webp'],
]) {
  const parsed = await readValidatedImage(requestWithFile(bytes, mimeType))
  assert.ok(parsed, mimeType + ' should pass signature validation')
  assert.equal(parsed.mimeType, mimeType)
  assert.equal(parsed.extension, extension)
  assert.equal(parsed.size, bytes.length)
}

assert.equal(await readValidatedImage(requestWithFile(jpeg, 'image/png')), null,
  'MIME spoofing must be rejected')
assert.equal(await readValidatedImage(requestWithFile(Uint8Array.from([0x47,0x49,0x46,0x38,0x39,0x61,0,0,0,0,0,0]), 'image/gif')), null,
  'GIF and other unsupported formats must be rejected')
const oversized = new Uint8Array(8 * 1024 * 1024 + 1)
oversized.set(jpeg)
assert.equal(await readValidatedImage(requestWithFile(oversized, 'image/jpeg')), null,
  'Files larger than 8 MiB must be rejected')
assert.equal(await readValidatedImage(new Request('https://example.test/upload', { method: 'POST', body: '{}' })), null,
  'Non-multipart requests must be rejected')

const env = {
  IMAGEKIT_PRIVATE_KEY: 'private_test_key_not_a_real_credential',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/demo',
}
const image = { bytes: jpeg, mimeType: 'image/jpeg', extension: 'jpg', size: jpeg.length }
const originalFetch = globalThis.fetch
let uploadRequest
try {
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(String(url), 'https://upload.imagekit.io/api/v1/files/upload')
    uploadRequest = init
    const data = init.body
    const fileName = data.get('fileName')
    const folder = data.get('folder')
    return Response.json({
      fileId: 'file12345678',
      filePath: folder + '/' + fileName,
      url: 'https://ik.imagekit.io/demo' + folder + '/' + fileName,
      fileType: 'image',
    })
  }
  const uploaded = await uploadImageKitImage(env, image, '/zameenhub/properties/property_123')
  assert.equal(uploaded.ok, true)
  assert.equal(uploaded.fileId, 'file12345678')
  assert.equal(uploaded.mimeType, 'image/jpeg')
  assert.match(uploadRequest.headers.authorization, /^Basic /)
  assert.equal(uploadRequest.body.get('folder'), '/zameenhub/properties/property_123')

  let deleteCalls = 0
  globalThis.fetch = async (url, init = {}) => {
    deleteCalls += 1
    assert.equal(String(url), 'https://api.imagekit.io/v1/files/file12345678')
    assert.equal(init.method, 'DELETE')
    assert.match(init.headers.authorization, /^Basic /)
    return new Response(null, { status: 404 })
  }
  assert.equal(await deleteImageKitFile(env, 'file12345678'), true,
    'A provider 404 should be treated as an idempotent delete')
  assert.equal(deleteCalls, 1)

  globalThis.fetch = async () => Response.json({
    fileId: 'file12345678',
    filePath: '/zameenhub/properties/property_123/not-the-expected-file.jpg',
    url: 'https://evil.example.test/not-the-file.jpg',
    fileType: 'image',
  })
  const rejected = await uploadImageKitImage(env, image, '/zameenhub/properties/property_123')
  assert.equal(rejected.ok, false,
    'Unexpected provider path/host must never be persisted')

  assert.equal((await uploadImageKitImage({}, image, '/zameenhub/properties/property_123')).ok, false,
    'Missing private key/endpoint must fail closed')
  assert.equal((await uploadImageKitImage(env, image, '/untrusted-folder')).ok, false,
    'Upload folder must be allowlisted')
} finally {
  globalThis.fetch = originalFetch
}

console.log('ImageKit helper tests passed: signatures, MIME spoofing, size limits, multipart handling, server auth, provider response validation, idempotent deletion and fail-closed configuration.')
