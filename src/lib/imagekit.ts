export type UploadedPropertyImage = {
  id: string
  url: string
  fileId: string
  sortOrder: number
}

export function uploadPropertyImage(
  propertyId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true; data: UploadedPropertyImage } | { ok: false; error: string }> {
  return new Promise(resolve => {
    const request = new XMLHttpRequest()
    const form = new FormData()
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
        resolve({ ok: false, error: 'The image service returned an unreadable response.' })
        return
      }
      if (request.status >= 200 && request.status < 300 && response.ok && response.data) {
        onProgress?.(100)
        resolve({ ok: true, data: response.data })
      } else {
        resolve({ ok: false, error: response.error || `Image upload failed (${request.status}). Please retry.` })
      }
    }

    request.onerror = () => resolve({ ok: false, error: 'ZameenHub could not reach ImageKit. Check your connection and retry.' })
    request.onabort = () => resolve({ ok: false, error: 'The image upload was interrupted.' })
    request.send(form)
  })
}
