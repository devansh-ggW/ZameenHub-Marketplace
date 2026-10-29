import { useEffect, useState, type FormEvent } from 'react'
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
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const session = await getSession()
    if (!session.ok || !session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true })
      setLoading(false); return
    }
    setUser(session.data.user)
    setProfileImageUrl(session.data.user.profileImageUrl || '')
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

  async function review(item: Property, status: 'published' | 'rejected', verifyEvidence = false) {
    const id = item.id
    let reviewNote = ''
    if (status === 'published' && verifyEvidence) {
      if (user?.role !== 'admin') { setError('Only an administrator can manually verify a listing.'); return }
      reviewNote = 'Administrator manually checked the property details and supporting reference information.'
    }
    let ownerMessage = ''
    if (status === 'rejected') {
      const note = window.prompt('Record the specific, evidence-based reason for internal moderation notes (at least 8 characters):')
      if (note === null) return
      if (note.trim().length < 8) { setError('Rejection cancelled. Add at least 8 characters of evidence-based notes.'); return }
      reviewNote = note.trim()
      const message = window.prompt('Write a clear explanation the property owner may see (at least 10 characters). Do not include internal fraud signals or another person’s private data:')
      if (message === null) return
      if (message.trim().length < 10) { setError('Rejection cancelled. Add a clear owner-facing explanation of at least 10 characters.'); return }
      ownerMessage = message.trim()
    }
    setWorkingId(id); setNotice(''); setError('')
    const result = await apiRequest<{ status: string; auditRecorded?: boolean }>(`/api/admin/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, reviewNote, ownerMessage, verifyEvidence }) })
    setWorkingId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(status === 'published' ? (verifyEvidence ? 'Listing marked Verified after manual administrator review.' : 'Listing approved and published. It remains Unverified until an administrator checks it.') : 'Listing rejected. The moderator decision was recorded.')
    setItems(current => current.filter(currentItem => currentItem.id !== id))
  }

  async function archiveListing(id: string) {
    if (!window.confirm('Archive this listing? It will no longer appear in public search. You can edit and resubmit it later.')) return
    setWorkingId(id); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; status: 'archived'; message: string }>(`/api/my/properties/${encodeURIComponent(id)}/archive`, { method: 'POST', body: '{}' })
    setWorkingId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(result.data.message)
    setItems(current => current.map(item => item.id === id ? { ...item, status: 'archived' } : item))
  }

  async function deleteListing(id: string) {
    if (!window.confirm('Permanently delete this property? This cannot be undone. Its listing, saved entries, inquiries, reports and associated chats will be removed.')) return
    setWorkingId(id); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; deleted: boolean; message: string }>(`/api/my/properties/${encodeURIComponent(id)}`, { method: 'DELETE' })
    setWorkingId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(result.data.message)
    setItems(current => current.filter(item => item.id !== id))
  }

  const title = kind === 'profile' ? 'Your profile.' : kind === 'saved' ? 'Saved properties.' : kind === 'my-listings' ? 'Your listings.' : 'Review queue.'
  return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Account</SectionKicker><h1>{title}</h1><p>{kind === 'review-queue' ? 'Review unverified public listings and handle older pending submissions. Only administrators can mark a listing Verified.' : kind === 'my-listings' ? 'New submissions publish immediately and carry an Unverified badge until an administrator checks the details.' : 'Private account data is loaded from the authenticated server session, not from browser-only state.'}</p></div>
    {loading ? <p className="status-message">Loading your account…</p> : <>
      {kind === 'profile' && user && <><div className="form-card account-profile"><div className="profile-heading"><div className="profile-avatar">{profileImageUrl ? <img src={profileImageUrl} alt={user.name + ' profile'} onError={event => { event.currentTarget.style.display = 'none' }} /> : <span aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>}</div><div><h2>Account details</h2><p className="muted">Your profile image appears beside your public listing contact details.</p></div></div><p><strong>Name</strong><br />{user.name}</p><p><strong>Email</strong><br />{user.email}</p><p><strong>Email status</strong><br />{user.emailVerified ? 'Verified' : 'Not verified'}</p><p><strong>Account role</strong><br />{user.role}</p><form className="profile-image-form" onSubmit={async event => { event.preventDefault(); setError(''); setNotice(''); setSavingProfile(true); const result = await apiRequest<{ profileImageUrl: string }>('/api/account/profile', { method: 'PATCH', body: JSON.stringify({ profileImageUrl: profileImageUrl.trim() }) }); setSavingProfile(false); if (!result.ok) { setError(result.error); return } setProfileImageUrl(result.data.profileImageUrl || ''); setUser(current => current ? { ...current, profileImageUrl: result.data.profileImageUrl || '' } : current); setNotice('Profile image URL saved.') }}><div className="form-field"><label htmlFor="profile-image-url">Profile image URL</label><input className="form-control" id="profile-image-url" type="url" maxLength={1500} value={profileImageUrl} onChange={event => setProfileImageUrl(event.target.value)} placeholder="https://example.com/your-profile-photo.jpg" /><small>Use a public HTTPS image URL. You can clear it to use your initials. ZameenHub stores the URL in D1 and does not upload the image.</small></div><div className="listing-actions"><button className="btn btn-outline" type="button" disabled={savingProfile || !profileImageUrl} onClick={() => setProfileImageUrl('')}>Remove image</button><button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile image'}</button></div></form>{error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice}</p>}<Link to="/list-property" className="btn btn-primary">List a property</Link></div><AccountSecurity user={user} /></>}
      {kind !== 'profile' && error && <p className="status-message error" role="alert">{error}</p>}
      {kind !== 'profile' && notice && <p className="status-message success" role="status">{notice}</p>}
      {kind !== 'profile' && !error && items.length > 0 && <div className="property-grid">{items.map(item => <div className="account-property" key={item.id}>
        <PropertyCard property={item} />
        {kind === 'my-listings' && <div className={`listing-status status-${item.status}`}>
          <strong>{item.status === 'pending' ? 'Pending review' : item.status === 'published' ? 'Published' : item.status === 'rejected' ? 'Rejected' : item.status === 'archived' ? 'Archived' : 'Listing status'}</strong><p><strong>Verification:</strong> {item.verified ? 'Verified · manually checked' : 'Unverified · awaiting manual verification'}</p>
          <p>{item.status === 'pending' ? 'Saved successfully. This listing is private while awaiting review.' : item.status === 'published' ? (item.verified ? 'This listing has been marked verified after moderator review and is visible in public property search.' : 'This listing is published and visible in public property search. Viewers should independently verify its details.') : item.status === 'rejected' ? (item.reviewMessage || 'This listing was not approved. Contact support if you need help.') : item.status === 'archived' ? 'This listing is archived and is not shown in public search.' : 'Check back here for the latest review status.'}</p>
        </div>}
        {kind === 'my-listings' && <div className="listing-actions listing-management-actions">
          <Link className="btn btn-outline" to={`/edit-listing/${encodeURIComponent(item.id)}`}>{item.status === 'archived' ? 'Edit and resubmit' : 'Edit details'}</Link>
          {item.status !== 'archived' && <button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void archiveListing(item.id)}>{workingId === item.id ? 'Working…' : 'Archive listing'}</button>}
          <button className="btn-danger" disabled={workingId === item.id} onClick={() => void deleteListing(item.id)}>{workingId === item.id ? 'Working…' : 'Delete property'}</button>
        </div>}
        {kind === 'review-queue' && <div className="verification-evidence-card"><strong>Verification: {item.verified ? 'Verified' : 'Unverified'}</strong>{item.verificationEvidenceUrl ? <><p>Reference type: {item.verificationEvidenceType || 'public record reference'}</p><a href={item.verificationEvidenceUrl} target="_blank" rel="noopener noreferrer">Open private evidence reference ↗</a><p className="muted">Check that the reference and submitted property details match. The link is private and is not itself proof of ownership.</p></> : <p className="muted">No public evidence reference supplied. Complete your independent checks before marking this listing Verified.</p>}</div>}
        {kind === 'review-queue' && <div className="review-actions">{item.status === 'pending' && <button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item, 'published')}>Approve & publish</button>}{!item.verified && user?.role === 'admin' && <button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item, 'published', true)}>Mark as verified</button>}<button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void review(item, 'rejected')}>Reject listing</button></div>}
      </div>)}</div>}
      {kind !== 'profile' && !error && items.length === 0 && <EmptyState title={kind === 'saved' ? 'Nothing saved yet.' : kind === 'my-listings' ? 'No submitted listings yet.' : 'No unverified listings.'} copy={kind === 'saved' ? 'Use the heart control on a property to save it to your account.' : kind === 'my-listings' ? 'Listings you submit will appear here with their review status.' : 'New and previously published unverified listings appear here so you can verify them manually.'} />}
    </>}
  </div></main>
}
