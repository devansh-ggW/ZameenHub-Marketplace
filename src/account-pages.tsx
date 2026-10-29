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
    let overrideRisk = false, reviewNote = ''
    if (status === 'published' && verifyEvidence) {
      if (!item.verificationEvidenceUrl) { setError('This listing has no evidence reference to review.'); return }
      const evidenceNote = window.prompt('Open the submitted public record reference, check that it relates to this property, and record what you checked (at least 20 characters):')
      if (evidenceNote === null) return
      if (evidenceNote.trim().length < 20) { setError('Evidence review cancelled. Record at least 20 characters describing the evidence checked.'); return }
      reviewNote = 'Evidence reviewed: ' + evidenceNote.trim()
    }
    if (status === 'published' && (item.aiRiskLevel === 'high' || (item.aiRiskScore ?? 0) >= 65)) {
      if (user?.role !== 'admin') { setError('High-risk listings can only be approved by an administrator after extra evidence checks.'); return }
      const note = window.prompt('HIGH-RISK LISTING. Verify the evidence outside this AI score first. Record at least 20 characters explaining why this listing is safe to publish:')
      if (note === null) return
      if (note.trim().length < 20) { setError('Approval cancelled. Record at least 20 characters of review notes to override a high-risk flag.'); return }
      overrideRisk = true; reviewNote = [reviewNote, 'High-risk review: ' + note.trim()].filter(Boolean).join(' | ')
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
    const result = await apiRequest<{ status: string; auditRecorded?: boolean }>(`/api/admin/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, overrideRisk, reviewNote, ownerMessage, verifyEvidence }) })
    setWorkingId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(status === 'published' ? (verifyEvidence ? 'Listing approved and published. The public evidence reference was recorded as reviewed; this is not a guarantee of legal title.' : 'Listing approved and published. The listing was reviewed, but submitted evidence was not marked verified.') : 'Listing rejected. The moderator decision was recorded.')
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

  const title = kind === 'profile' ? 'Your profile.' : kind === 'saved' ? 'Saved properties.' : kind === 'my-listings' ? 'Your listings.' : 'Review queue.'
  return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Account</SectionKicker><h1>{title}</h1><p>{kind === 'review-queue' ? 'Only authorized moderators and admins can approve a submission for public discovery.' : kind === 'my-listings' ? 'Listings that pass Cloudflare AI’s low-risk screen may publish automatically; other submissions remain private for review. AI screening is not proof of ownership.' : 'Private account data is loaded from the authenticated server session, not from browser-only state.'}</p></div>
    {loading ? <p className="status-message">Loading your account…</p> : <>
      {kind === 'profile' && user && <><div className="form-card account-profile"><div className="profile-heading"><div className="profile-avatar">{profileImageUrl ? <img src={profileImageUrl} alt={user.name + ' profile'} onError={event => { event.currentTarget.style.display = 'none' }} /> : <span aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>}</div><div><h2>Account details</h2><p className="muted">Your profile image appears beside your public listing contact details.</p></div></div><p><strong>Name</strong><br />{user.name}</p><p><strong>Email</strong><br />{user.email}</p><p><strong>Email status</strong><br />{user.emailVerified ? 'Verified' : 'Not verified'}</p><p><strong>Account role</strong><br />{user.role}</p><form className="profile-image-form" onSubmit={async event => { event.preventDefault(); setError(''); setNotice(''); setSavingProfile(true); const result = await apiRequest<{ profileImageUrl: string }>('/api/account/profile', { method: 'PATCH', body: JSON.stringify({ profileImageUrl: profileImageUrl.trim() }) }); setSavingProfile(false); if (!result.ok) { setError(result.error); return } setProfileImageUrl(result.data.profileImageUrl || ''); setUser(current => current ? { ...current, profileImageUrl: result.data.profileImageUrl || '' } : current); setNotice('Profile image URL saved.') }}><div className="form-field"><label htmlFor="profile-image-url">Profile image URL</label><input className="form-control" id="profile-image-url" type="url" maxLength={1500} value={profileImageUrl} onChange={event => setProfileImageUrl(event.target.value)} placeholder="https://example.com/your-profile-photo.jpg" /><small>Use a public HTTPS image URL. You can clear it to use your initials. ZameenHub stores the URL in D1 and does not upload the image.</small></div><div className="listing-actions"><button className="btn btn-outline" type="button" disabled={savingProfile || !profileImageUrl} onClick={() => setProfileImageUrl('')}>Remove image</button><button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save profile image'}</button></div></form>{error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice}</p>}<Link to="/list-property" className="btn btn-primary">List a property</Link></div><AccountSecurity user={user} /></>}
      {kind !== 'profile' && error && <p className="status-message error" role="alert">{error}</p>}
      {kind !== 'profile' && notice && <p className="status-message success" role="status">{notice}</p>}
      {kind !== 'profile' && !error && items.length > 0 && <div className="property-grid">{items.map(item => <div className="account-property" key={item.id}>
        <PropertyCard property={item} />
        {kind === 'my-listings' && <div className={`listing-status status-${item.status}`}>
          <strong>{item.status === 'pending' ? 'Pending review' : item.status === 'published' ? 'Published' : item.status === 'rejected' ? 'Rejected' : item.status === 'archived' ? 'Archived' : 'Listing status'}</strong><p><strong>Evidence:</strong> {item.verificationStatus || 'unverified'}{item.verified ? ' · moderator reviewed' : ' · no verified badge'}</p>
          <p>{item.status === 'pending' ? 'Saved successfully. AI could not safely auto-publish this listing, so it is private while awaiting review.' : item.status === 'published' ? (item.aiScreened ? 'This listing passed Cloudflare AI content-risk screening and is visible in public search. That does not prove property ownership.' : 'This listing is published and visible in public property search. Viewers should independently verify its details.') : item.status === 'rejected' ? (item.reviewMessage || 'This listing was not approved. Contact support if you need help.') : item.status === 'archived' ? 'This listing is archived and is not shown in public search.' : 'Check back here for the latest review status.'}</p>
        </div>}
        {kind === 'my-listings' && <div className="listing-actions listing-management-actions">
          <Link className="btn btn-outline" to={`/edit-listing/${encodeURIComponent(item.id)}`}>{item.status === 'archived' ? 'Edit and resubmit' : 'Edit details'}</Link>
          {item.status !== 'archived' && <button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void archiveListing(item.id)}>{workingId === item.id ? 'Archiving…' : 'Archive listing'}</button>}
        </div>}
        {kind === 'review-queue' && <><div className="verification-evidence-card"><strong>Evidence review: {item.verificationStatus || 'unverified'}</strong>{item.verificationEvidenceUrl ? <><p>Type: {item.verificationEvidenceType || 'public record reference'}</p><a href={item.verificationEvidenceUrl} target="_blank" rel="noopener noreferrer">Open submitted evidence reference ↗</a><p className="muted">Check the source and whether its details match this listing. Do not award the badge based on an AI score or URL alone.</p></> : <p className="muted">No evidence URL supplied. The listing can be reviewed for publication without an evidence-reviewed badge.</p>}</div><div className={`ai-risk-card ai-risk-${item.aiRiskLevel ?? 'unscored'}`}><strong>AI risk screen: {item.aiRiskLevel ?? 'not-screened'} · {item.aiRiskScore ?? 0}/100</strong><p>Risk scoring is a triage signal, not proof of fraud or ownership. Check the evidence before making a decision.</p>{item.aiRiskReasons?.length ? <ul>{item.aiRiskReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p>No specific text flags were returned.</p>}</div></>}
        {kind === 'review-queue' && <div className="review-actions"><button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item, 'published')}>Approve & publish</button>{!!item.verificationEvidenceUrl && <button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void review(item, 'published', true)}>Approve + mark evidence reviewed</button>}<button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void review(item, 'rejected')}>Reject</button></div>}
      </div>)}</div>}
      {kind !== 'profile' && !error && items.length === 0 && <EmptyState title={kind === 'saved' ? 'Nothing saved yet.' : kind === 'my-listings' ? 'No submitted listings yet.' : 'Review queue is clear.'} copy={kind === 'saved' ? 'Use the heart control on a property to save it to your account.' : kind === 'my-listings' ? 'Listings you submit will appear here with their review status.' : 'Pending submissions will appear here when they are available.'} />}
    </>}
  </div></main>
}
