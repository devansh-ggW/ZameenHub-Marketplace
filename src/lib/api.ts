import type { Property } from './data'

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string }

async function readJson<T>(response: Response): Promise<ApiResponse<T>> {
  if (!response.ok) return { ok: false, error: `The property service returned ${response.status}. Try again later.` }
  try {
    const body = await response.json() as { ok?: boolean; data?: T; error?: string }
    if (body.ok === false) return { ok: false, error: body.error ?? 'The property service returned an error.' }
    return { ok: true, data: body.data as T }
  } catch {
    return { ok: false, error: 'The property service returned an unreadable response.' }
  }
}

export async function getProperties(params: URLSearchParams): Promise<ApiResponse<Property[]>> {
  try {
    const response = await fetch(`/api/properties${params.toString() ? `?${params.toString()}` : ''}`, { headers: { accept: 'application/json' } })
    const result = await readJson<Property[]>(response)
    if (!result.ok) return result
    return { ok: true, data: Array.isArray(result.data) ? result.data : [] }
  } catch {
    return { ok: false, error: 'The property service is not reachable. No sample properties are shown.' }
  }
}

export async function getProperty(slug: string): Promise<ApiResponse<Property>> {
  try {
    const response = await fetch(`/api/properties/${encodeURIComponent(slug)}`, { headers: { accept: 'application/json' } })
    return readJson<Property>(response)
  } catch {
    return { ok: false, error: 'The property service is not reachable. This listing cannot be loaded.' }
  }
}

export async function submitInquiry(payload: { propertyId: string; message: string; email: string }): Promise<ApiResponse<{ reference: string; notificationSent?: boolean }>> {
  if (!payload.email.includes('@') || payload.message.trim().length < 12) return { ok: false, error: 'Please enter a valid email and a little more detail.' }
  try {
    const response = await fetch('/api/inquiries', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) })
    return readJson<{ reference: string; notificationSent?: boolean }>(response)
  } catch {
    return { ok: false, error: 'Inquiry delivery is not configured. Your message was not sent.' }
  }
}

export async function createListing(payload: Partial<Property>): Promise<ApiResponse<{ status: 'pending'; id: string }>> {
  if (!payload.title || !payload.location || !payload.price) return { ok: false, error: 'Complete the required listing details before submitting.' }
  try {
    const response = await fetch('/api/properties', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) })
    return readJson<{ status: 'pending'; id: string }>(response)
  } catch {
    return { ok: false, error: 'Listing submission is not configured. Your draft was not sent.' }
  }
}
