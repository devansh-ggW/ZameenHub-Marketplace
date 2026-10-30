import { apiRequest } from './auth'

export type UploadedImage = {
  id: string
  url: string
  fileId: string
  mimeType: string
  size: number
}

async function upload(path: string, file: File) {
  const form = new FormData()
  form.append('file', file, file.name)
  return apiRequest<UploadedImage>(path, { method: 'POST', body: form })
}

export function uploadPropertyImage(propertyId: string, file: File) {
  return upload('/api/my/properties/' + encodeURIComponent(propertyId) + '/images', file)
}

export function uploadProfileImage(file: File) {
  return upload('/api/account/profile-image', file)
}

export function imageKitVariant(url: string, width: number): string {
  if (!url || !Number.isFinite(width) || width < 1) return url
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !/(^|\.)ik\.imagekit\.io$/i.test(parsed.hostname)) return url
    const transform = 'tr=w-' + Math.round(width) + ',q-85,f-auto'
    parsed.searchParams.set('tr', transform)
    return parsed.toString()
  } catch {
    return url
  }
}
