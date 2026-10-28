export type Env = { DB?: D1Database; R2?: R2Bucket; SESSION_SECRET?: string }

type Json = Record<string, unknown>
const json = (body: Json, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

export default { async fetch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return new Response('ZameenHub API', { status: 200 })
  if (request.method === 'GET' && url.pathname === '/api/health') return json({ ok: true, data: { service: 'zameenhub-api' } })
  if (!env.DB) return json({ ok: false, error: 'Database is not configured for this environment.' }, 503)
  if (url.pathname === '/api/properties' && request.method === 'GET') return json({ ok: true, data: [], meta: { source: 'D1', message: 'Connect approved listings to populate this endpoint.' } })
  if (url.pathname === '/api/auth/session' && request.method === 'GET') return json({ ok: true, data: { authenticated: false } })
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') return json({ ok: true, data: { loggedOut: true } })
  if (url.pathname === '/api/properties' && request.method === 'POST') return json({ ok: true, data: { status: 'pending' } }, 202)
  return json({ ok: false, error: 'Route not implemented in this deployment boundary.' }, 404)
} }
