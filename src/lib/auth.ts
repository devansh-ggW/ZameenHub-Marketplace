export type AppUser = {
  id: string
  email: string
  name: string
  role: 'user' | 'moderator' | 'admin'
  emailVerified: boolean
}
export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number }

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' })
    let body: { ok?: boolean; data?: T; error?: string }
    try { body = await response.json() as typeof body }
    catch { return { ok: false, error: 'The server returned an unreadable response. Please try again.', status: response.status } }
    if (!response.ok || body.ok === false) {
      return { ok: false, error: body.error ?? `Request failed (${response.status}). Please try again.`, status: response.status }
    }
    return { ok: true, data: body.data as T, status: response.status }
  } catch {
    return { ok: false, error: 'ZameenHub could not reach its server. Check your connection and try again.', status: 0 }
  }
}

export async function getSession() {
  return apiRequest<{ authenticated: boolean; user?: AppUser }>('/api/auth/session')
}

export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  try {
    const parsed = new URL(value, window.location.origin)
    if (parsed.origin !== window.location.origin) return fallback
    return parsed.pathname + parsed.search + parsed.hash
  } catch { return fallback }
}
