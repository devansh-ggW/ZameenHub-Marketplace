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
  const [profileName, setProfileName] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [cleanupRunning, setCleanupRunning] = useState(false)

  async function load() {
    setLoading(true); setError('')
    const session = await getSession()
    if (!session.ok) {
      setError('We could not check your sign-in right now. Your session has not been cleared. Check your connection and retry.')
      setLoading(false); return
    }
    if (!session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true })
      setLoading(false); return
    }
    setUser(session.data.user)
    setProfileImageUrl(session.data.user.profileImageUrl || '')
    setProfileName(session.data.user.name)
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
      reviewNote = 'Manual verification completed by administrator.'
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

  async function retryImageKitCleanup() {
    setCleanupRunning(true); setError(''); setNotice('')
    const result = await apiRequest<{ processed: number; deleted: number; remaining: number }>('/api/admin/imagekit-cleanup', { method: 'POST', body: '{}' })
    setCleanupRunning(false)
    if (!result.ok) { setError(result.error); return }
    setNotice('ImageKit cleanup: ' + result.data.deleted + ' file(s) removed; ' + result.data.remaining + ' still pending.')
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
  return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Account</SectionKicker><h1>{title}</h1><p>{kind === 'review-queue' ? 'Review unverified public listings and handle older pending submissions. Only administrators can mark a listing Verified.' : kind === 'my-listings' ? 'Listings appear publicly only when they have at least one active property photo and one active seller-provided PDF/image evidence item. Evidence can be uploaded to ImageKit or linked from an external HTTPS source. Eligible listings may be public while Unverified; only an administrator can separately record an evidence review.' : 'Private account data is loaded from the authenticated server session, not from browser-only state.'}</p></div>
    {loading ? <p className="status-message">Loading your account…</p> : <>
      {kind === 'review-queue' && user?.role === 'admin' && <section className="form-card imagekit-cleanup-panel" aria-labelledby="imagekit-cleanup-title">
        <h2 id="imagekit-cleanup-title">ImageKit cleanup</h2>
        <p className="muted">Retry deletion of ImageKit files that could not be cleaned up during an earlier upload replacement or D1 failure. This only processes queued file IDs; it does not change listing verification.</p>
        <button className="btn btn-outline" type="button" disabled={cleanupRunning} onClick={() => void retryImageKitCleanup()}>{cleanupRunning ? 'Retrying cleanup…' : 'Retry pending ImageKit cleanup'}</button>
      </section>}
      {kind === 'profile' && user && <><div className="form-card account-profile"><div className="profile-heading"><div className="profile-avatar">{profileImageUrl ? <img src={profileImageUrl} alt={user.name + ' profile'} onError={event => { event.currentTarget.style.display = 'none' }} /> : <span aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>}</div><div><h2>Account details</h2><p className="muted">Your profile image appears beside your public listing contact details.</p></div></div><div className="profile-name-row"><p><strong>Name</strong><br />{user.name}</p>{user.role === 'admin' && <span className="admin-role-badge">ZameenHub Admin</span>}<button className="btn btn-outline" type="button" onClick={() => { setProfileName(user.name); setEditingProfile(current => !current) }}>{editingProfile ? 'Cancel edit' : 'Edit profile'}</button></div>{editingProfile && <form className="profile-edit-form" onSubmit={async event => { event.preventDefault(); const name = profileName.trim(); if (name.length < 2) { setError('Your display name must contain at least 2 characters.'); return } setSavingProfile(true); setError(''); const result = await apiRequest<{ name: string }>('/api/account/profile', { method: 'PATCH', body: JSON.stringify({ name }) }); setSavingProfile(false); if (!result.ok) { setError(result.error); return } setUser(current => current ? { ...current, name: result.data.name } : current); setProfileName(result.data.name); setEditingProfile(false); setNotice('Profile updated successfully.') }}><div className="form-field"><label htmlFor="profile-display-name">Display name</label><input className="form-control" id="profile-display-name" minLength={2} maxLength={100} required value={profileName} onChange={event => setProfileName(event.target.value)} /></div><button className="btn btn-primary" disabled={savingProfile || profileName.trim().length < 2}>{savingProfile ? 'Saving…' : 'Save profile'}</button></form>}<p><strong>Email</strong><br />{user.email}</p><p><strong>Email status</strong><br />{user.emailVerified ? 'Verified' : 'Not verified'}</p><p><strong>Account role</strong><br />{user.role === 'admin' ? 'Administrator' : user.role}</p><form className="profile-image-form" onSubmit={async event => {
        event.preventDefault()
        const fileInput = event.currentTarget.elements.namedItem('profile-image-file') as HTMLInputElement | null
        const file = fileInput?.files?.[0]
        if (!file) { setError('Choose a JPEG, PNG or WebP image first.'); return }
        setError(''); setNotice(''); setSavingProfile(true)
        const form = new FormData(); form.append('file', file)
        const result = await apiRequest<{ profileImageUrl: string; cleanupPending?: boolean }>('/api/account/profile-image', { method: 'POST', body: form })
        setSavingProfile(false)
        if (!result.ok) { setError(result.error); return }
        setProfileImageUrl(result.data.profileImageUrl)
        setUser(current => current ? { ...current, profileImageUrl: result.data.profileImageUrl } : current)
        if (fileInput) fileInput.value = ''
        setNotice(result.data.cleanupPending ? 'New profile image saved. The old ImageKit file needs cleanup.' : 'Profile image uploaded to ImageKit.')
      }}>
        <div className="form-field">
          <label htmlFor="profile-image-file">Profile image</label>
          <input className="form-control" id="profile-image-file" name="profile-image-file" type="file" accept="image/jpeg,image/png,image/webp" />
          <small>JPEG, PNG or WebP · maximum 10 MB. Your image is uploaded to ImageKit; the original file is not stored in D1.</small>
        </div>
        <div className="listing-actions">
          <button className="btn btn-outline" type="button" disabled={savingProfile || !profileImageUrl} onClick={async () => {
            setError(''); setNotice(''); setSavingProfile(true)
            const result = await apiRequest<{ profileImageUrl: string; cleanupPending?: boolean }>('/api/account/profile-image', { method: 'DELETE' })
            setSavingProfile(false)
            if (!result.ok) { setError(result.error); return }
            setProfileImageUrl('')
            setUser(current => current ? { ...current, profileImageUrl: '' } : current)
            setNotice(result.data.cleanupPending ? 'Profile image removed. ImageKit cleanup is queued for retry.' : 'Profile image removed from ImageKit.')
          }}>Remove image</button>
          <button className="btn btn-primary" disabled={savingProfile}>{savingProfile ? 'Uploading…' : 'Upload profile image'}</button>
        </div>
      </form>{error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice}</p>}<Link to="/list-property" className="btn btn-primary">List a property</Link></div><AccountSecurity user={user} /></>}
      {kind !== 'profile' && error && <p className="status-message error" role="alert">{error}</p>}
      {kind !== 'profile' && notice && <p className="status-message success" role="status">{notice}</p>}
      {kind !== 'profile' && !error && items.length > 0 && <div className="property-grid">{items.map(item => <div className="account-property" key={item.id}>
        <PropertyCard property={item} />
        {kind === 'my-listings' && <div className={`listing-status status-${item.status}`}>
          <strong>{item.status === 'draft' ? 'Draft · not public' : item.status === 'pending' ? 'Pending review' : item.status === 'published' && item.publicEligible === false ? 'Hidden · missing photo or document' : item.status === 'published' ? 'Published' : item.status === 'rejected' ? 'Rejected' : item.status === 'archived' ? 'Archived' : 'Listing status'}</strong><p><strong>Verification:</strong> {item.verified ? 'Verified · manually checked' : 'Unverified · awaiting manual verification'}</p>
          <p>{item.status === 'draft' ? 'This draft is private. Add at least one property photo and one PDF/image evidence item. You can upload the file or add an existing HTTPS evidence link.' : item.status === 'pending' ? 'Saved successfully. This listing is private while awaiting review.' : item.status === 'published' && item.publicEligible === false ? 'This listing is hidden from public search because it is missing at least one active property photo or PDF/image evidence item. Edit it to restore both.' : item.status === 'published' ? (item.verified ? 'This listing has been manually checked and is visible in public property search.' : 'This listing is public with its required photo and seller-provided PDF/image evidence. It remains Unverified unless an administrator separately records an evidence review.') : item.status === 'rejected' ? (item.reviewMessage || 'This listing was not approved. Contact support if you need help.') : item.status === 'archived' ? 'This listing is archived and is not shown in public search.' : 'Check back here for the latest review status.'}</p>
        </div>}
        {kind === 'my-listings' && <div className="listing-actions listing-management-actions">
          <Link className="btn btn-outline" to={`/edit-listing/${encodeURIComponent(item.id)}`}>{item.status === 'archived' ? 'Edit and resubmit' : 'Edit details'}</Link>
          {item.status !== 'archived' && <button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void archiveListing(item.id)}>{workingId === item.id ? 'Working…' : 'Archive listing'}</button>}
          <button className="btn-danger" disabled={workingId === item.id} onClick={() => void deleteListing(item.id)}>{workingId === item.id ? 'Working…' : 'Delete property'}</button>
        </div>}
        {kind === 'review-queue' && <div className="verification-evidence-card"><strong>Verification: {item.verified ? 'Verified' : 'Unverified'}</strong>{item.verificationEvidenceUrl ? <><p>Reference type: {item.verificationEvidenceType || 'public record reference'}</p><a href={item.verificationEvidenceUrl} target="_blank" rel="noopener noreferrer">Open private evidence reference ↗</a><p className="muted">Check that the reference and submitted property details match. The link is private and is not itself proof of ownership.</p></> : <p className="muted">No separate public-record reference was supplied. Inspect the seller-provided evidence and any reliable independent records available to you. Record an evidence review only after completing the check; a platform review is not proof of legal ownership.</p>}</div>}
        {kind === 'review-queue' && <div className="review-actions">{item.status === 'pending' && <button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item, 'published')}>Approve & publish</button>}{!item.verified && user?.role === 'admin' && <button className="btn btn-primary" disabled={workingId === item.id} onClick={() => void review(item, 'published', true)}>Mark as verified</button>}<button className="btn btn-outline" disabled={workingId === item.id} onClick={() => void review(item, 'rejected')}>Reject listing</button></div>}
      </div>)}</div>}
      {kind !== 'profile' && !error && items.length === 0 && <EmptyState title={kind === 'saved' ? 'Nothing saved yet.' : kind === 'my-listings' ? 'No submitted listings yet.' : 'No unverified listings.'} copy={kind === 'saved' ? 'Use the heart control on a property to save it to your account.' : kind === 'my-listings' ? 'Listings you submit will appear here with their review status.' : 'New and previously published unverified listings appear here so you can verify them manually.'} />}
    </>}
  </div></main>
}
