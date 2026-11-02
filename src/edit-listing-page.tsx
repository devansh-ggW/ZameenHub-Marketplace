import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SectionKicker } from './components'
import type { Property, PropertyType } from './lib/data'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'
import { uploadPropertyEvidence, uploadPropertyImage } from './lib/imagekit'

export function EditListingPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [purpose, setPurpose] = useState<'sale' | 'rent'>('sale')
  const [propertyType, setPropertyType] = useState<PropertyType>('Apartment')
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [city, setCity] = useState('')
  const [price, setPrice] = useState('')
  const [bedrooms, setBedrooms] = useState('0')
  const [bathrooms, setBathrooms] = useState('0')
  const [area, setArea] = useState('0')
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [documents, setDocuments] = useState<Array<{ id?: string; documentType: 'pdf' | 'image'; description: string; url: string; sourceDomain?: string; storageProvider?: 'imagekit' | 'external'; sortOrder?: number; createdAt?: string; updatedAt?: string }>>([])
  const [evidenceFiles, setEvidenceFiles] = useState<Array<{ file: File; description: string }>>([])
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const session = await getSession()
      if (!session.ok) {
        setError('We could not check your sign-in right now. Your session has not been cleared. Check your connection and retry.')
        setLoading(false)
        return
      }
      if (!session.data.authenticated) {
        navigate('/login?next=' + encodeURIComponent('/edit-listing/' + id), { replace: true })
        setLoading(false)
        return
      }
      const result = await apiRequest<Property>('/api/my/properties/' + encodeURIComponent(id))
      if (!active) return
      if (!result.ok) {
        setError(result.error)
        setLoading(false)
        return
      }
      const item = result.data
      setProperty(item)
      setPurpose(item.purpose)
      setPropertyType(item.propertyType)
      setTitle(item.title)
      setLocation(item.location)
      setCity(item.city)
      setPrice(String(item.price))
      setBedrooms(String(item.bedrooms))
      setBathrooms(String(item.bathrooms))
      setArea(String(item.area))
      setDescription(item.description)
      setAmenities(item.amenities.filter(amenity => (PROPERTY_AMENITIES as readonly string[]).includes(amenity)))
      setDocuments(item.documents || [])
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id, navigate])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setNotice('')
    const numericPrice = Number(price), numericBeds = Number(bedrooms), numericBaths = Number(bathrooms), numericArea = Number(area)
    if (!title.trim() || title.trim().length < 6 || !location.trim() || !city.trim()
      || description.trim().length < 20 || !Number.isSafeInteger(numericPrice) || numericPrice < 1
      || !Number.isSafeInteger(numericBeds) || numericBeds < 0 || numericBeds > 100
      || !Number.isSafeInteger(numericBaths) || numericBaths < 0 || numericBaths > 100
      || !Number.isSafeInteger(numericArea) || numericArea < 0 || numericArea > 100_000_000) {
      setError('Check the title, location, city, positive price, room counts, area, and description before saving.')
      return
    }
    setSaving(true)
    const submittedDocuments = documents.filter(item => item.url.trim() && item.description.trim()).map(item => ({ ...(item.id ? { id: item.id } : {}), documentType: item.documentType, description: item.description.trim(), url: item.url.trim() }))
    const hasPublicPhoto = (property?.gallery.length || 0) > 0 || imageFiles.length > 0
    const hasPublicDocument = submittedDocuments.length > 0 || evidenceFiles.length > 0
    if (evidenceFiles.some(item => item.description.trim().length < 3)) { setSaving(false); setError('Give every new evidence file a clear description of at least 3 characters.'); return }
    if ((evidenceFiles.length > 0 || documents.some(item => !item.id)) && !privacyAcknowledged) { setSaving(false); setError('Confirm that new evidence does not expose personal IDs or private information.'); return }
    const result = await apiRequest<{ id: string; status: 'published' | 'draft'; verified: false; message: string }>('/api/my/properties/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea,
        description: description.trim(), amenities,
        documents: submittedDocuments,
        verificationEvidenceType: property?.verificationEvidenceType || 'none', verificationEvidenceUrl: property?.verificationEvidenceUrl || '',
      }),
    })
    if (!result.ok) { setSaving(false); setError(result.error); return }
    setProperty(current => current ? { ...current, title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType, price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea, description: description.trim(), amenities, status: result.data.status, publicEligible: hasPublicPhoto && hasPublicDocument, verificationEvidenceType: property?.verificationEvidenceType || 'none', verificationEvidenceUrl: property?.verificationEvidenceUrl || '', verificationStatus: 'unverified', verified: false } : current)

    const knownMediaIds = new Set((property?.imageMedia || []).map(media => media.id))
    for (let index = 0; index < imageFiles.length; index++) {
      setUploadStatus('Uploading image ' + (index + 1) + ' of ' + imageFiles.length)
      const uploaded = await uploadPropertyImage(id, imageFiles[index], setUploadProgress, [...knownMediaIds])
      if (!uploaded.ok) {
        setSaving(false)
        setError('Your listing changes were saved, but image ' + (index + 1) + ' could not be confirmed: ' + uploaded.error)
        setNotice('Listing changes saved. Check the photo gallery before retrying this image.')
        return
      }
      knownMediaIds.add(uploaded.data.id)
      setProperty(current => current ? { ...current, gallery: [...current.gallery, uploaded.data.url], image: current.image || uploaded.data.url, imageMedia: [...(current.imageMedia || []), { id: uploaded.data.id, url: uploaded.data.url, fileId: uploaded.data.fileId, sortOrder: uploaded.data.sortOrder }] } : current)
      setUploadProgress(0)
    }
    const knownEvidenceIds = new Set((property?.documents || []).map(document => document.id))
    for (let index = 0; index < evidenceFiles.length; index++) {
      const evidence = evidenceFiles[index]
      setUploadStatus('Uploading evidence ' + (index + 1) + ' of ' + evidenceFiles.length)
      const uploaded = await uploadPropertyEvidence(id, evidence.file, evidence.description.trim(), setUploadProgress, [...knownEvidenceIds])
      if (!uploaded.ok) {
        setSaving(false)
        setError('Your listing changes were saved, but evidence file ' + (index + 1) + ' could not be confirmed: ' + uploaded.error)
        setNotice('Listing changes saved. Check the Evidence Room before retrying this file.')
        return
      }
      knownEvidenceIds.add(uploaded.data.id)
      setUploadProgress(0)
    }
    if (result.data.status === 'draft' && hasPublicPhoto && hasPublicDocument) {
      const publication = await apiRequest<{ id: string; status: 'published'; message: string }>('/api/my/properties/' + encodeURIComponent(id) + '/publish', { method: 'POST' })
      if (!publication.ok) {
        setSaving(false)
        setError('Draft saved, but publishing is blocked: ' + publication.error)
        setNotice('The listing remains private until the required photo and document are saved.')
        return
      }
      setProperty(current => current ? { ...current, status: 'published', publicEligible: true } : current)
      setNotice(publication.data.message)
    } else if (result.data.status === 'draft') {
      setNotice('Draft saved privately. Add at least one property photo and one seller-provided document link, then save again to publish.')
    } else if (!hasPublicPhoto || !hasPublicDocument) {
      setNotice('Changes saved. This listing is hidden from public search until it has at least one property photo and one seller-provided document link.')
    } else {
      setNotice(result.data.message)
    }
    // Re-read the saved seller documents so newly assigned IDs and timestamps
    // remain stable if the owner edits this listing again without reloading.
    const refreshed = await apiRequest<Property>('/api/my/properties/' + encodeURIComponent(id))
    if (refreshed.ok) {
      setProperty(refreshed.data)
      setDocuments(refreshed.data.documents || [])
    }
    setSaving(false)
    setUploadStatus(imageFiles.length ? 'All selected photos uploaded to ImageKit.' : '')
  }

  if (loading) return <main className="page-shell"><div className="container"><p className="status-message">Loading your listing…</p></div></main>
  if (error && !property) return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Could not load this listing.</h1><p>{error}</p><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link></div></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Edit your listing.</h1><p>Save corrections to your property details. Changes go live immediately; because details changed, the listing becomes Unverified until an administrator checks it again.</p></div>
    {property && <form className="form-card edit-listing-form" onSubmit={submit}>
      <div className="edit-listing-meta"><span>Current status: <strong>{property.status}</strong></span><span>Verification status: <strong>{property.verified ? 'Verified' : 'Unverified · awaiting manual verification'}</strong></span><span>Reference: <code>{property.id}</code></span></div>
      <div className="form-grid">
        <div className="form-field"><label htmlFor="edit-purpose">Purpose</label><select className="form-control" id="edit-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div>
        <div className="form-field"><label htmlFor="edit-type">Property type</label><select className="form-control" id="edit-type" value={propertyType} onChange={e => setPropertyType(e.target.value as PropertyType)}>{(['Apartment','House','Villa','Studio','Plot'] as PropertyType[]).map(type => <option key={type} value={type}>{type}</option>)}</select></div>
        <div className="form-field full"><label htmlFor="edit-title">Listing title</label><input className="form-control" id="edit-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-location">Address / neighbourhood</label><input className="form-control" id="edit-location" required maxLength={240} value={location} onChange={e => setLocation(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-city">City</label><input className="form-control" id="edit-city" required maxLength={100} value={city} onChange={e => setCity(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-price">Price (₹)</label><input className="form-control" id="edit-price" type="number" required min="1" max="1000000000" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-beds">Bedrooms</label><input className="form-control" id="edit-beds" type="number" min="0" max="100" step="1" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-baths">Bathrooms</label><input className="form-control" id="edit-baths" type="number" min="0" max="100" step="1" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-area">Area (sq ft)</label><input className="form-control" id="edit-area" type="number" min="0" max="100000000" step="1" value={area} onChange={e => setArea(e.target.value)} /></div>
        <div className="form-field full"><label htmlFor="edit-description">Description</label><textarea className="form-control" id="edit-description" required minLength={20} maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} /><small>Keep the description accurate and do not include passwords, identity documents, or another person's private data.</small></div>
        <div className="form-field full"><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset></div>
        <section className="media-editor full" aria-labelledby="edit-property-media-heading">
          <h3 id="edit-property-media-heading">Property photos</h3>
          <p className="muted">A public listing needs at least one active photo. Removing the last photo hides the listing from public search until a photo is added again. Keep up to five JPEG, PNG or WebP images, maximum 10 MB each.</p>
          <div className="media-url-list">
            {property?.gallery.map((url, index) => {
              const media = property.imageMedia?.[index]
              return <div className="media-url-row" key={media?.id || url}>
                <img src={url} alt={'Property photo ' + (index + 1)} loading="lazy" width={112} height={80} />
                <span className="muted">Photo {index + 1}</span>
                {media?.id && <button className="btn btn-outline media-remove" type="button" onClick={async () => {
                  setError(''); setNotice('')
                  const result = await apiRequest<{ id: string; deleted: boolean; cleanupPending?: boolean }>('/api/my/properties/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(media.id), { method: 'DELETE' })
                  if (!result.ok) { setError(result.error); return }
                  setProperty(current => current ? { ...current, gallery: current.gallery.filter((_, i) => i !== index), image: current.gallery.filter((_, i) => i !== index)[0] || '', imageMedia: (current.imageMedia || []).filter(item => item.id !== media.id), verificationStatus: 'unverified', verified: false } : current)
                  setNotice(result.data.cleanupPending ? 'Photo removed from the listing. ImageKit cleanup is queued for an administrator.' : 'Photo removed.')
                }}>Remove</button>}
              </div>
            })}
          </div>
          <div className="form-field">
            <label htmlFor="edit-property-images">Add photos</label>
            <input className="form-control" id="edit-property-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
              const remaining = Math.max(0, 5 - (property?.gallery.length || 0))
              const files = Array.from(event.target.files || []).slice(0, remaining)
              if (files.some(file => file.size > 10 * 1024 * 1024)) { setError('Each photo must be 10 MB or smaller.'); event.target.value = ''; return }
              setImageFiles(files); setError('')
            }} />
            <small>{property?.gallery.length || 0} existing · {imageFiles.length} new selected · maximum five total.</small>
          </div>
          {uploadStatus && <p className="status-message" role="status">{uploadStatus}{saving && imageFiles.length > 0 ? ' · ' + uploadProgress + '%' : ''}</p>}
        </section>
        <section className="verification-editor full evidence-editor" aria-labelledby="edit-property-documents-heading">
          <div className="evidence-editor-banner">
            <SectionKicker>THE ZAMEENHUB DIFFERENCE</SectionKicker>
            <h3 id="edit-property-documents-heading">Property Evidence Room.</h3>
            <p>DON'T TRUST US. CHECK THE DAMN THING YOURSELF.</p>
            <span>Give buyers the evidence. Let them inspect it independently.</span>
          </div>
          <p className="muted">Add supporting property records as PDF or image files. New uploads are stored and delivered through ImageKit and can be opened by anyone viewing your published listing. ZameenHub does not legally authenticate documents or confirm ownership.</p>
          <div className="evidence-privacy-warning" role="note">
            <strong>Privacy warning — redact personal information first.</strong>
            <p>Never upload an Aadhaar card, PAN card, passport, bank statement, full ID number, QR code, personal phone number, bank details, or an unredacted signature. Share only the property-related parts buyers need to inspect. Upload a redacted copy; do not upload the document if you cannot safely hide private details.</p>
          </div>
          <div className="document-link-list">
            {documents.map((document, index) => <div className="document-link-card evidence-existing-document" key={document.id || index}>
              <div className="evidence-file-mark" aria-hidden="true">{document.documentType.toUpperCase()}</div>
              <div className="evidence-document-copy">
                <strong>{document.description}</strong>
                <span className="evidence-seller-label">{document.storageProvider === 'imagekit' ? 'ImageKit-hosted evidence' : 'External seller-hosted link'}</span>
                {document.createdAt && <p className="muted">Added {new Date(document.createdAt).toLocaleString('en-IN')}{document.updatedAt && document.updatedAt !== document.createdAt ? ' · Updated ' + new Date(document.updatedAt).toLocaleString('en-IN') : ''}</p>}
              </div>
              <div className="form-field evidence-existing-description"><label htmlFor={'edit-document-description-' + index}>Description</label><input className="form-control" id={'edit-document-description-' + index} maxLength={180} value={document.description} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} /></div>
              {document.storageProvider === 'imagekit'
                ? <a href={document.url} target="_blank" rel="noopener noreferrer" className="evidence-open-link">Open uploaded file ↗</a>
                : <div className="form-field evidence-existing-url"><label htmlFor={'edit-document-url-' + index}>Original HTTPS link</label><input className="form-control" id={'edit-document-url-' + index} type="url" maxLength={2000} value={document.url} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /></div>}
              <button className="btn btn-outline media-remove" type="button" onClick={() => setDocuments(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>)}
          </div>
          <div className="form-field evidence-upload-field">
            <label htmlFor="edit-property-evidence-files">Upload more evidence to ImageKit</label>
            <input className="form-control" id="edit-property-evidence-files" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" multiple onChange={event => {
              const remaining = Math.max(0, 10 - documents.length - evidenceFiles.length)
              const selected = Array.from(event.target.files || [])
              if (selected.some(file => file.size > 10 * 1024 * 1024)) { setError('Each evidence file must be 10 MB or smaller.'); event.target.value = ''; return }
              if (selected.some(file => !['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type.toLowerCase()))) { setError('Evidence files must be PDF, JPEG, PNG or WebP.'); event.target.value = ''; return }
              setEvidenceFiles(current => [...current, ...selected.slice(0, remaining).map(file => ({ file, description: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').slice(0, 180) }))])
              setError('')
              event.target.value = ''
            }} />
            <small>{documents.length + evidenceFiles.length} of 10 evidence files/links · max 10 MB each.</small>
          </div>
          {evidenceFiles.map((item, index) => <div className="evidence-selected-file" key={index}>
            <div className="evidence-selected-file-name"><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)} MB</small></div>
            <div className="form-field"><label htmlFor={'edit-new-evidence-description-' + index}>What does this document prove?</label><input className="form-control" id={'edit-new-evidence-description-' + index} value={item.description} maxLength={180} onChange={event => setEvidenceFiles(current => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, description: event.target.value } : entry))} placeholder="e.g. Property tax receipt" /></div>
            <button className="btn btn-outline media-remove" type="button" onClick={() => setEvidenceFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove file</button>
          </div>)}
          <label className="evidence-privacy-ack"><input type="checkbox" checked={privacyAcknowledged} onChange={event => setPrivacyAcknowledged(event.target.checked)} /> <span>I confirm new evidence files and links do not expose personal ID numbers or private information.</span></label>
          {uploadStatus && <p className="status-message" role="status">{uploadStatus}{saving ? ' · ' + uploadProgress + '%' : ''}</p>}
        </section>
      </div>
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      <div className="listing-actions"><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>}
  </div></main>
}
