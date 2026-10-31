export type UploadedPropertyImage = {
  id: string
  url: string
  fileId: string
  sortOrder: number
}

async function findPersistedPropertyImage(
  propertyId: string,
  knownMediaIds: ReadonlySet<string>,
): Promise<UploadedPropertyImage | null> {
  try {
    const response = await fetch('/api/my/properties/' + encodeURIComponent(propertyId), {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const payload = await response.json() as {
      ok?: boolean
      data?: { imageMedia?: UploadedPropertyImage[] }
    }
    if (payload.ok !== true || !Array.isArray(payload.data?.imageMedia)) return null
    return payload.data.imageMedia.find(media =>
      typeof media?.id === 'string' && !knownMediaIds.has(media.id)
      && typeof media.url === 'string' && typeof media.fileId === 'string'
      && Number.isInteger(media.sortOrder)
    ) ?? null
  } catch {
    return null
  }
}

export function uploadPropertyImage(
  propertyId: string,
  file: File,
  onProgress?: (percent: number) => void,
  knownMediaIds: readonly string[] = [],
): Promise<{ ok: true; data: UploadedPropertyImage } | { ok: false; error: string }> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest()
    const form = new FormData()
    const knownIds = new Set(knownMediaIds)
    let settled = false
    const finish = (result: { ok: true; data: UploadedPropertyImage } | { ok: false; error: string }) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const reconcileOrFail = async (error: string) => {
      // The Worker can finish saving the photo even if the browser loses or
      // cannot parse the response. Verify D1 before telling the owner it failed.
      const persisted = await findPersistedPropertyImage(propertyId, knownIds)
      if (persisted) {
        onProgress?.(100)
        finish({ ok: true, data: persisted })
      } else {
        finish({ ok: false, error })
      }
    }

    form.append('propertyId', propertyId)
    form.append('file', file)

    request.open('POST', '/api/media/property-image')
    request.withCredentials = true
    request.setRequestHeader('Accept', 'application/json')

    request.upload.onprogress = event => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))))
      }
    }

    request.onload = () => {
      let response: { ok?: boolean; data?: UploadedPropertyImage; error?: string }
      try {
        response = JSON.parse(request.responseText) as typeof response
      } catch {
        void reconcileOrFail('The image service returned an unreadable response.')
        return
      }
      if (request.status >= 200 && request.status < 300 && response.ok && response.data) {
        onProgress?.(100)
        finish({ ok: true, data: response.data })
      } else {
        void reconcileOrFail(response.error || `Image upload failed (${request.status}). Please retry.`)
      }
    }

    request.onerror = () => void reconcileOrFail('ZameenHub could not reach ImageKit. Check your connection and retry.')
    request.onabort = () => void reconcileOrFail('The image upload was interrupted.')
    request.send(form)
  })
}
