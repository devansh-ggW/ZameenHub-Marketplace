import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { EmptyState, PropertyCard, SectionKicker } from './components'
import type { Property } from './lib/data'
import { apiRequest, getSession, type AppUser } from './lib/auth'
import { AccountSecurity } from './account-security'

type AccountKind = 'profile' | 'saved' | 'my-listings' | 'review-queue'
export function AccountPage({ kind }: { kind: AccountKind }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [user, setUser] = useState<AppUser | null>(null)
  const [items, setItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [workingId, setWorkingId] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    const session = await getSession()
    if (!session.ok || !session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true })
      setLoading(false); return
    }
    setUser(session.data.user)
    if (kind === 'saved') {
      const result = await apiRequest<Property[]>('/api/favorites')
      if (result.ok) setItems(result.data); else setError(result.error)
    } else if (kind === 'my-listings') {
      const result = await apiRequest<Property[]>('/api/my/properties')
      if (result.ok) setItems(result.data); else setError(result.error)
    } else if (kind === 'review-queue') {
      if (!['admin', 'moderator'].includes(session.data.user.role)) setError('You do not have permission to review listings.')
      else {
        const result = await apiRequest<Property[]>('/api/admin/review-queue')
        if (result.ok) setItems(result.data); else setError(result.error)
      }
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [kind, location.pathname])

  async function review(id: string, status: 'published' | 'rejected') {
    setWorkingId(id); setNotice(''); setError('')
    const result = await apiRequest<{ status: string }>(`/api/admin/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) })
    setWorkingId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(status === 'published' ? 'Listing approved and published.' : 'Listing rejected.')
    setItems(current => current.filter(item => item.id !== id))
  }

  const title = kind === 'profile' ? 'Your profile.' : kind === 'saved' ? 'Saved properties.' : kind === 'my-listings' ? 'Your listings.' : 'Review queue.'
  return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Account</SectionKicker><h1>{title}</h1><p>{kind === 'review-queue' ? 'Only authorized moderators and admins can approve a submission for public discovery.' : kind === 'my-listings' ? 'Your submissions appear here immediately. They become visible in Browse properties only after approval.' : 'Private account data is loaded from the authenticated server session, not from browser-only state.'}</p></div>
    {loading ? <p className="status-message">Loading your account…</p> : <>
      {kind === 'profile' && user && <div className="form-card account-profile"><h2>Account details</h2><p><strong>Name</strong><br />{user.name}</p><p><strong>Email</strong><br />{user.email}</p><p><strong>Email status</strong><br />{user.emailVerified ? 'Verified' : 'Not verified'}</p><p><strong>Account role</strong><br />{user.role}</p><Link to="/list-property" className="btn btn-primary">List a property</Link></div><AccountSecurity user={user} />}
      {kind !== 'profile' && error && <p className="status-message error" role="alert">{error}</p>}
      {kind !== 'profile' && notice && <p className="status-message success" role="status">{notice}</p>}
      {kind !== 'profile' && !error && items.length > 0 && <div className="property-grid">{items.map(item => <div className="account-property" key={item.id}>
        <PropertyCard property={item} />
        {kind === 'my-listings' && <div className={`listing-status status-${item.status}`}>
          <strong>{item.status === 'pending' ? 'Pending review' : item.status === 'published' ? 'Published' : item.status === 'rejected' ? 'Rejected' : item.status === 'archived' ? 'Archived' : 'Listing status'}</strong>
          <p>{item.status === 'pending' ? 'Saved successfully. This listing is private and will not appear in public search until approved.' : item.status === 'published' ? 'This listing is approved and available in public property search.' : item.status === 'rejected' ? 'This listing was not approved. Contact support if you need help.' : item.status === 'archived' ? 'This listing is archived and is not shown in public search.' : 'Check back here for the latest review status.'}</p>
        </div>}
        {kind === 'review-queue' && <div className={`ai-risk-card ai-risk-${item.aiRiskLevel ?? 'unscored'}`}><strong>AI risk screen: {item.aiRiskLevel ?? 'not-screened'} · {item.aiRiskScore ?? 0}/100</strong><p>Risk scoring is a triage signal, not proof of fraud or ownership. Check the evidence before making a decision.</p>{item.aiRiskReasons?.length ? <ul>{item.aiRiskReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p>No specific text flags were returned.</p>}</div>}
        {kind === 'review-queue' && <div className="review-actions"><button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item.id, 'published')}>Approve</button><button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void review(item.id, 'rejected')}>Reject</button></div>}
      </div>)}</div>}
      {kind !== 'profile' && !error && items.length === 0 && <EmptyState title={kind === 'saved' ? 'Nothing saved yet.' : kind === 'my-listings' ? 'No submitted listings yet.' : 'Review queue is clear.'} copy={kind === 'saved' ? 'Use the heart control on a property to save it to your account.' : kind === 'my-listings' ? 'Listings you submit will appear here with their review status.' : 'Pending submissions will appear here when they are available.'} />}
    </>}
  </div></main>
}
