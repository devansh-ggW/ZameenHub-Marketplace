import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, SectionKicker } from './components'
import { apiRequest, getSession, type AppUser } from './lib/auth'

type Overview = {
  users: number
  bannedUsers: number
  publishedProperties: number
  unverifiedProperties: number
  openReports: number
  pendingListings: number
}
type AdminUser = {
  id: string
  email: string
  name: string
  role: string
  email_verified: number
  mfa_enabled: number
  mfa_email_enabled: number
  is_banned: number
  banned_reason: string
  created_at: string
}
type AdminProperty = {
  id: string
  slug: string
  title: string
  status: string
  city: string
  price: number
  created_at: string
  verification_status: string
  owner_email: string
  owner_name: string
}
type AdminAction = {
  id: string
  admin_id: string | null
  admin_email: string | null
  action: string
  target_id: string
  target_label: string
  reason: string
  created_at: string
}
type Tab = 'overview' | 'users' | 'properties' | 'activity'

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0)

export function AdminPanelPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AppUser | null>(null)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [properties, setProperties] = useState<AdminProperty[]>([])
  const [activity, setActivity] = useState<AdminAction[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [query, setQuery] = useState('')
  const [propertyStatus, setPropertyStatus] = useState('all')
  const [adminNote, setAdminNote] = useState('Administrator action after review.')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (search = '', status = 'all') => {
    setLoading(true)
    setError('')
    const session = await getSession()
    if (!session.ok || !session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent('/admin'), { replace: true })
      setLoading(false)
      return
    }
    setUser(session.data.user)
    if (session.data.user.role !== 'admin') {
      setError('The administrator panel is available only to an administrator account.')
      setLoading(false)
      return
    }
    const qs = new URLSearchParams()
    if (search.trim()) qs.set('q', search.trim())
    if (status !== 'all') qs.set('status', status)
    const suffix = qs.toString() ? '?' + qs.toString() : ''
    const [overviewResult, usersResult, propertiesResult, activityResult] = await Promise.all([
      apiRequest<Overview>('/api/admin/overview'),
      apiRequest<AdminUser[]>('/api/admin/users' + (search.trim() ? '?q=' + encodeURIComponent(search.trim()) : '')),
      apiRequest<AdminProperty[]>('/api/admin/properties' + suffix),
      apiRequest<AdminAction[]>('/api/admin/activity'),
    ])
    const failed = [overviewResult, usersResult, propertiesResult, activityResult].find(result => !result.ok)
    if (failed && !failed.ok) {
      setError(failed.error)
    } else if (overviewResult.ok && usersResult.ok && propertiesResult.ok && activityResult.ok) {
      setOverview(overviewResult.data)
      setUsers(usersResult.data)
      setProperties(propertiesResult.data)
      setActivity(activityResult.data)
    }
    setLoading(false)
  }, [navigate])

  useEffect(() => { void load() }, [load])

  async function search(event: FormEvent) {
    event.preventDefault()
    await load(query, propertyStatus)
  }

  async function updateUser(account: AdminUser, action: 'ban' | 'unban') {
    const reason = adminNote.trim()
    if (reason.length < 8) { setError('Add an admin note of at least 8 characters before changing an account.'); return }
    if (action === 'ban' && !window.confirm('Suspend ' + account.email + '? They will be signed out and will not be able to sign in until unbanned.')) return
    setBusyId(account.id); setError(''); setNotice('')
    const result = await apiRequest<{ isBanned: boolean; message: string }>('/api/admin/users/' + encodeURIComponent(account.id), {
      method: 'PATCH',
      body: JSON.stringify({ action, reason }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(result.data.message)
    await load(query, propertyStatus)
  }

  async function verifyProperty(property: AdminProperty) {
    if (property.status !== 'published' || property.verification_status === 'verified') return
    if (!window.confirm('Mark "' + property.title + '" as Verified? Only continue after you have independently checked its details.')) return
    setBusyId(property.id); setError(''); setNotice('')
    const result = await apiRequest<{ status: string; verificationStatus: string }>('/api/admin/properties/' + encodeURIComponent(property.id), {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'published',
        verifyEvidence: true,
        reviewNote: 'Administrator manually checked the property details and supporting reference information.',
      }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setNotice('Property marked Verified. The administrator action was recorded.')
    await load(query, propertyStatus)
  }

  async function archiveProperty(property: AdminProperty) {
    const reason = adminNote.trim()
    if (reason.length < 8) { setError('Add an admin note of at least 8 characters before archiving a property.'); return }
    if (property.status !== 'published') { setError('Only published properties can be taken offline this way.'); return }
    if (!window.confirm('Take "' + property.title + '" offline? It will disappear from public property search.')) return
    setBusyId(property.id); setError(''); setNotice('')
    const result = await apiRequest<{ status: string }>('/api/admin/properties/' + encodeURIComponent(property.id), {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived', reviewNote: reason }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setNotice('Property taken offline and the moderation decision recorded.')
    await load(query, propertyStatus)
  }

  async function deleteProperty(property: AdminProperty) {
    const reason = adminNote.trim()
    if (reason.length < 8) { setError('Add an admin note of at least 8 characters before deleting a property.'); return }
    if (!window.confirm('Permanently delete "' + property.title + '"? This also removes related media, favorites, inquiries, reports and property chat history. This cannot be undone.')) return
    setBusyId(property.id); setError(''); setNotice('')
    const result = await apiRequest<{ deleted: boolean; message: string }>('/api/admin/properties/' + encodeURIComponent(property.id), {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(result.data.message)
    await load(query, propertyStatus)
  }

  const statCards = overview ? [
    { label: 'Registered accounts', value: overview.users },
    { label: 'Suspended accounts', value: overview.bannedUsers },
    { label: 'Published properties', value: overview.publishedProperties },
    { label: 'Awaiting verification', value: overview.unverifiedProperties },
    { label: 'Pending listings', value: overview.pendingListings },
    { label: 'Open property reports', value: overview.openReports },
  ] : []

  return <main className="page-shell"><div className="container admin-shell">
    <div className="page-title"><SectionKicker>Restricted workspace</SectionKicker><h1>Admin control room.</h1><p>Manage accounts and listings, review trust signals, and keep a traceable record of administrative changes.</p></div>
    <div className="admin-tab-list" role="tablist" aria-label="Admin sections">
      {(['overview', 'users', 'properties', 'activity'] as Tab[]).map(item => <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'admin-tab active' : 'admin-tab'} onClick={() => setTab(item)}>{item === 'overview' ? 'Overview' : item === 'users' ? 'Accounts' : item === 'properties' ? 'Properties' : 'Activity log'}</button>)}
    </div>
    <div className="admin-toolbar">
      <div><strong>{user ? user.name : 'Administrator'}</strong><span>{user ? user.email : 'Sign in required'} · role: {user ? user.role : '—'}</span></div>
      <div className="admin-quick-links"><Link className="btn btn-outline" to="/review-queue">Verification queue</Link><Link className="btn btn-outline" to="/report-queue">Reports</Link></div>
    </div>
    {loading && <p className="status-message">Loading admin data…</p>}
    {error && <p className="status-message error" role="alert">{error}</p>}
    {notice && <p className="status-message success" role="status">{notice}</p>}
    {user && user.role === 'admin' && !loading && <>
      {tab === 'overview' && <><div className="admin-stat-grid">{statCards.map(card => <article className="admin-stat-card" key={card.label}><span>{card.label}</span><strong>{card.value.toLocaleString('en-IN')}</strong></article>)}</div>
        <section className="admin-section"><div className="admin-section-head"><div><h2>Quick actions</h2><p>Open the queues for work that needs individual review.</p></div></div><div className="admin-shortcut-grid"><button className="admin-shortcut" onClick={() => setTab('users')}><strong>Find an account</strong><span>Search by email or name, suspend or restore access.</span></button><button className="admin-shortcut" onClick={() => setTab('properties')}><strong>Manage properties</strong><span>Verify, take listings offline, or permanently remove a property.</span></button><Link className="admin-shortcut" to="/report-queue"><strong>Resolve reports</strong><span>Investigate fraud and inaccurate-listing reports.</span></Link><Link className="admin-shortcut" to="/review-queue"><strong>Verification queue</strong><span>Review unverified listings and mark checks complete.</span></Link></div></section>
      </>}
      {(tab === 'users' || tab === 'properties') && <section className="admin-section">
        <div className="admin-section-head"><div><h2>{tab === 'users' ? 'Account management' : 'Property management'}</h2><p>{tab === 'users' ? 'Suspension blocks new sign-ins and revokes current sessions. Administrator accounts are protected.' : 'Verification is a separate signal from publication. Deleting a property is permanent.'}</p></div></div>
        <form className="admin-search-form" onSubmit={search}><div className="form-field"><label htmlFor="admin-search">{tab === 'users' ? 'Search name or email' : 'Search title, owner email or city'}</label><input className="form-control" id="admin-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'users' ? 'name@example.com' : 'Apartment or city'} /></div>{tab === 'properties' && <div className="form-field"><label htmlFor="admin-property-status">Listing status</label><select className="form-control" id="admin-property-status" value={propertyStatus} onChange={event => setPropertyStatus(event.target.value)}><option value="all">All statuses</option><option value="published">Published</option><option value="archived">Archived</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></div>}<button className="btn btn-primary" disabled={loading}>Search</button></form>
        <div className="form-field admin-note-field"><label htmlFor="admin-action-note">Admin note for moderation actions</label><textarea className="form-control" id="admin-action-note" rows={2} value={adminNote} onChange={event => setAdminNote(event.target.value)} maxLength={1000} /><small>Used for the audit trail when suspending accounts, archiving properties or deleting properties. At least 8 characters.</small></div>
        {tab === 'users' && (users.length ? <div className="admin-record-list">{users.map(account => <article className="admin-record-card" key={account.id}>
          <div className="admin-record-main"><div className="admin-record-heading"><h3>{account.name}</h3><span className={account.is_banned ? 'admin-state suspended' : 'admin-state active'}>{account.is_banned ? 'Suspended' : 'Active'}</span></div><p>{account.email}</p><div className="admin-record-meta"><span>Role: {account.role}</span><span>Email: {account.email_verified ? 'verified' : 'unverified'}</span><span>2-step: {account.mfa_enabled || account.mfa_email_enabled ? 'on' : 'off'}</span><span>Joined: {new Date(account.created_at).toLocaleDateString('en-IN')}</span></div>{account.is_banned === 1 && <p className="admin-note-preview">Suspension note: {account.banned_reason || 'No reason supplied.'}</p>}</div>
          <div className="admin-record-actions">{account.is_banned === 1 ? <button className="btn btn-outline" disabled={busyId === account.id} onClick={() => void updateUser(account, 'unban')}>{busyId === account.id ? 'Updating…' : 'Restore access'}</button> : <button className="btn-danger" disabled={busyId === account.id || account.role === 'admin'} onClick={() => void updateUser(account, 'ban')}>{busyId === account.id ? 'Suspending…' : 'Suspend account'}</button>}</div>
        </article>)}</div> : <EmptyState title="No matching accounts." copy="Try a different email or name." />)}
        {tab === 'properties' && (properties.length ? <div className="admin-record-list">{properties.map(property => <article className="admin-record-card" key={property.id}>
          <div className="admin-record-main"><div className="admin-record-heading"><h3>{property.title}</h3><span className={'admin-state ' + (property.status === 'published' ? 'active' : 'neutral')}>{property.status}</span></div><p>{property.city} · {money(property.price)}</p><div className="admin-record-meta"><span>Owner: {property.owner_name}</span><span>{property.owner_email}</span><span>Verification: {property.verification_status}</span><span>Listed: {new Date(property.created_at).toLocaleDateString('en-IN')}</span></div><p><Link to={'/properties/' + property.slug} target="_blank" rel="noreferrer">Open property page ↗</Link></p></div>
          <div className="admin-record-actions">{property.status === 'published' && property.verification_status !== 'verified' && <button className="btn btn-primary" disabled={busyId === property.id} onClick={() => void verifyProperty(property)}>Mark verified</button>}{property.status === 'published' && <button className="btn btn-outline" disabled={busyId === property.id} onClick={() => void archiveProperty(property)}>Take offline</button>}<button className="btn-danger" disabled={busyId === property.id} onClick={() => void deleteProperty(property)}>{busyId === property.id ? 'Working…' : 'Delete permanently'}</button></div>
        </article>)}</div> : <EmptyState title="No matching properties." copy="Try another title, owner email or city, or choose a different status." />)}
      </section>}
      {tab === 'activity' && <section className="admin-section"><div className="admin-section-head"><div><h2>Recent admin activity</h2><p>Suspensions, restorations and property moderation actions are recorded here.</p></div></div>{activity.length ? <div className="admin-record-list">{activity.map(item => <article className="admin-record-card" key={item.id}><div className="admin-record-main"><div className="admin-record-heading"><h3>{item.action.replaceAll('_', ' ')}</h3><span className="admin-state neutral">{new Date(item.created_at).toLocaleString('en-IN')}</span></div><p>Target: {item.target_label || item.target_id || 'Unknown target'} · by {item.admin_email || 'Former administrator'}</p><p className="admin-note-preview">{item.reason}</p></div></article>)}</div> : <EmptyState title="No admin actions yet." copy="Administrative actions will appear here when recorded." />}</section>}
    </>}
  </div></main>
}
