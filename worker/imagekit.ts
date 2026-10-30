const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 128 * 1024

export type ImageKitEnvironment = {
  IMAGEKIT_PRIVATE_KEY?: string
  IMAGEKIT_URL_ENDPOINT?: string
}

export type ValidatedImage = {
  bytes: Uint8Array
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  extension: 'jpg' | 'png' | 'webp'
  size: number
}

export type ImageKitUploadResult =
  | { ok: true; fileId: string; filePath: string; url: string; mimeType: string; size: number }
  | { ok: false; status: number; error: string; orphanedFileId?: string }

function sniffImage(bytes: Uint8Array): Pick<ValidatedImage, 'mimeType' | 'extension'> | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e
    && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return { mimeType: 'image/png', extension: 'png' }
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' }
  }
  return null
}

/** Read one bounded multipart image and verify its bytes, not just its filename/MIME claim. */
export async function readValidatedImage(request: Request): Promise<ValidatedImage | null> {
  const contentType = request.headers.get('content-type') || ''
  if (!/^multipart\/form-data\s*;/i.test(contentType)) return null
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) return null

  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel('Image upload exceeds the size limit').catch(() => {})
        return null
      }
      chunks.push(value)
    }
    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    const form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
    const candidate = form.get('file')
    if (!(candidate instanceof File) || candidate.size < 12 || candidate.size > MAX_IMAGE_BYTES) return null
    const fileBytes = new Uint8Array(await candidate.arrayBuffer())
    const detected = sniffImage(fileBytes)
    if (!detected) return null
    if (candidate.type && candidate.type !== 'application/octet-stream' && candidate.type !== detected.mimeType) return null
    return { bytes: fileBytes, ...detected, size: fileBytes.byteLength }
  } catch {
    return null
  }
}

function imageKitConfiguration(env: ImageKitEnvironment): { key: string; endpoint: URL } | null {
  const key = env.IMAGEKIT_PRIVATE_KEY || ''
  const endpointValue = env.IMAGEKIT_URL_ENDPOINT || ''
  if (!key.startsWith('private_') || key.length < 20 || !endpointValue) return null
  try {
    const endpoint = new URL(endpointValue)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null
    return { key, endpoint }
  } catch {
    return null
  }
}

/** Server-side upload using the restricted ImageKit private key (never returned to the browser). */
export async function uploadImageKitImage(
  env: ImageKitEnvironment,
  image: ValidatedImage,
  folder: string,
): Promise<ImageKitUploadResult> {
  const configuration = imageKitConfiguration(env)
  if (!configuration) {
    return { ok: false, status: 503, error: 'ImageKit upload is not configured. Check the Worker restricted private key and URL endpoint.' }
  }
  if (!/^\/zameenhub\/(?:properties|profiles)\/[A-Za-z0-9_-]{1,100}$/.test(folder)) {
    return { ok: false, status: 400, error: 'The requested media destination is invalid.' }
  }

  const fileName = 'zh-' + crypto.randomUUID().replace(/-/g, '') + '.' + image.extension
  const upload = new FormData()
  upload.append('file', new Blob([image.bytes.buffer as ArrayBuffer], { type: image.mimeType }), fileName)
  upload.set('fileName', fileName)
  upload.set('folder', folder)
  upload.set('useUniqueFileName', 'false')
  upload.set('isPrivateFile', 'false')

  let response: Response
  try {
    response = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      headers: { authorization: 'Basic ' + btoa(configuration.key + ':') },
      body: upload,
    })
  } catch {
    return { ok: false, status: 502, error: 'ImageKit could not be reached. Your image was not saved.' }
  }

  let result: Record<string, unknown> = {}
  try { result = await response.json() as Record<string, unknown> } catch { /* invalid provider response */ }
  const fileId = typeof result.fileId === 'string' ? result.fileId : ''
  const filePath = typeof result.filePath === 'string' ? result.filePath : ''
  const url = typeof result.url === 'string' ? result.url : ''
  const expectedPath = folder + '/' + fileName
  let validUrl = false
  try {
    const parsed = new URL(url)
    const endpointPath = configuration.endpoint.pathname.replace(/\/$/, '')
    validUrl = parsed.protocol === 'https:' && parsed.origin === configuration.endpoint.origin
      && (!endpointPath || parsed.pathname.startsWith(endpointPath + '/'))
  } catch { validUrl = false }

  if (!response.ok || !fileId || filePath !== expectedPath || !validUrl || result.fileType !== 'image') {
    const removed = fileId ? await deleteImageKitFile(env, fileId).catch(() => false) : true
    return {
      ok: false,
      status: 502,
      error: 'ImageKit rejected the image or returned unexpected file metadata. No image record was saved.',
      ...(!removed && /^[A-Za-z0-9_-]{8,100}$/.test(fileId) ? { orphanedFileId: fileId } : {}),
    }
  }

  return { ok: true, fileId, filePath, url, mimeType: image.mimeType, size: image.size }
}

/** Deletion is idempotent: a provider 404 means the asset is already absent. */
export async function deleteImageKitFile(env: ImageKitEnvironment, fileId: string): Promise<boolean> {
  const configuration = imageKitConfiguration(env)
  if (!configuration || !/^[A-Za-z0-9_-]{8,100}$/.test(fileId)) return false
  try {
    const response = await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(fileId), {
      method: 'DELETE',
      headers: { authorization: 'Basic ' + btoa(configuration.key + ':') },
    })
    return response.ok || response.status === 404
  } catch {
    return false
  }
}
