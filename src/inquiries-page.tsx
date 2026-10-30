import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'

type OwnerInquiry = {
  id: string
  property_id: string
  sender_id: string | null
  email: string
  message: string
  status: 'new' | 'read' | 'archived'
  created_at: string
  property_title: string
  property_slug: string
  property_city: string
}

export function InquiriesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<OwnerInquiry[]>([])
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const session = await getSession()
    if (!session.ok) {
      setError(session.error)
      setLoading(false); return
    }
    if (!session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent('/inquiries'), { replace: true })
      setLoading(false); return
    }
    const result = await apiRequest<OwnerInquiry[]>('/api/my/inquiries')
    if (result.ok) setItems(result.data)
    else setError(result.error)
    setLoading(false)
  }, [navigate])

  useEffect(() => { void load() }, [load])

  async function update(item: OwnerInquiry, status: 'read' | 'archived') {
    setBusyId(item.id); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; status: 'read' | 'archived' }>(
      '/api/my/inquiries/' + encodeURIComponent(item.id),
      { method: 'PATCH', body: JSON.stringify({ status }) },
    )
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setItems(current => current.map(row => row.id === item.id ? { ...row, status: result.data.status } : row))
    setNotice(status === 'read' ? 'Inquiry marked as read.' : 'Inquiry archived.')
  }

  const visible = items.filter(item => filter === 'archived' ? item.status === 'archived' : item.status !== 'archived')
  const unread = items.filter(item => item.status === 'new').length

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Owner dashboard</SectionKicker><h1>Property inquiries.</h1><p>Real messages sent about properties you own. Only the owner of each listing can view its inbox. Contact the sender directly by email to continue the conversation.</p></div>
    <div className="inbox-toolbar">
      <div><strong>{unread}</strong><span> new {unread === 1 ? 'inquiry' : 'inquiries'}</span></div>
      <div className="inbox-tabs" role="group" aria-label="Filter inquiries">
        <button type="button" className={filter === 'active' ? 'active' : ''} aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Active inbox</button>
        <button type="button" className={filter === 'archived' ? 'active' : ''} aria-pressed={filter === 'archived'} onClick={() => setFilter('archived')}>Archived</button>
      </div>
    </div>
    {loading ? <p className="status-message">Loading your inbox…</p> : <>
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      {!error && visible.length === 0 && <EmptyState title={filter === 'archived' ? 'No archived inquiries.' : 'No inquiries yet.'} copy={filter === 'archived' ? 'Messages you archive will appear here.' : 'When someone asks about one of your published properties, the inquiry will appear here and be emailed to your account address.'} />}
      {!error && visible.length > 0 && <div className="inquiry-inbox">{visible.map(item => <article className={'inquiry-card inquiry-' + item.status} key={item.id}>
        <div className="inquiry-card-head">
          <div><span className={'inquiry-status inquiry-status-' + item.status}>{item.status === 'new' ? 'New' : item.status === 'read' ? 'Read' : 'Archived'}</span><h2>{item.property_title}</h2><p>{item.property_city} · Received {new Date(item.created_at).toLocaleString('en-IN')}</p></div>
          <Link className="inquiry-property-link" to={'/properties/' + item.property_slug}>View listing</Link>
        </div>
        <div className="inquiry-message">{item.message}</div>
        <p className="inquiry-sender">From <a href={'mailto:' + item.email}>{item.email}</a></p>
        <div className="inquiry-actions">
          {item.status === 'new' && <button className="btn btn-outline" disabled={busyId === item.id} onClick={() => void update(item, 'read')}>Mark as read</button>}
          {item.status !== 'archived' && <button className="btn btn-outline" disabled={busyId === item.id} onClick={() => void update(item, 'archived')}>{busyId === item.id ? 'Updating…' : 'Archive'}</button>}
          <a className="btn btn-primary" href={'mailto:' + item.email + '?subject=' + encodeURIComponent('Regarding ' + item.property_title)}>Reply by email</a>
        </div>
      </article>)}</div>}
    </>}
  </div></main>
}
