import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SectionKicker } from './components'
import type { Property, PropertyDocument, PropertyImageMedia, PropertyType } from './lib/data'
import { apiRequest, getSession } from './lib/auth'
import { uploadPropertyImage } from './lib/media'
import { PROPERTY_AMENITIES } from './lib/property-options'

type DocumentDraft = Omit<PropertyDocument, 'id' | 'sourceDomain' | 'sortOrder'>

export function EditListingPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploadStatus, setUploadStatus] = useState('')
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
  const [newImages, setNewImages] = useState<File[]>([])
  const [imageDeleting, setImageDeleting] = useState('')
  const [documents, setDocuments] = useState<DocumentDraft[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      const session = await getSession()
      if (!session.ok || !session.data.authenticated) {
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
      setDocuments((item.documents || []).map(({ type, description, url }) => ({ type, description, url })))
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [id, navigate])

  async function removeImage(image: PropertyImageMedia) {
    setImageDeleting(image.id)
    setError('')
    const result = await apiRequest<{ deleted: boolean }>(
      '/api/my/properties/' + encodeURIComponent(id) + '/images/' + encodeURIComponent(image.id),
      { method: 'DELETE' },
    )
    setImageDeleting('')
    if (!result.ok) { setError(result.error); return }
    setProperty(current => current ? {
      ...current,
      imageMedia: (current.imageMedia || []).filter(item => item.id !== image.id),
      gallery: (current.gallery || []).filter(url => url !== image.url),
      image: current.image === image.url ? ((current.gallery || []).find(url => url !== image.url) || '') : current.image,
    } : current)
    setNotice('Photo removed.')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setNotice(''); setUploadStatus('')
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
    const result = await apiRequest<{ id: string; status: 'pending'; verified: false; message: string }>('/api/my/properties/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea,
        description: description.trim(), amenities, documents,
        verificationEvidenceType: 'none', verificationEvidenceUrl: '',
      }),
    })
    if (!result.ok) {
      setSaving(false)
      setError(result.error)
      return
    }
    let nextMedia: PropertyImageMedia[] = property?.imageMedia || []
    let completed = 0
    let uploadError = ''
    for (const file of newImages) {
      const uploaded = await uploadPropertyImage(id, file)
      if (!uploaded.ok) { uploadError = uploaded.error; break }
      completed += 1
      nextMedia = [...nextMedia, {
        id: uploaded.data.id, url: uploaded.data.url, fileId: uploaded.data.fileId,
        mimeType: uploaded.data.mimeType, size: uploaded.data.size,
      }]
    }
    setSaving(false)
    setNewImages([])
    setProperty(current => current ? {
      ...current, title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType,
      price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea,
      description: description.trim(), amenities, status: result.data.status,
      imageMedia: nextMedia, gallery: nextMedia.map(item => item.url), image: nextMedia[0]?.url || '',
      documents: documents.map((item, index) => ({
        ...item, id: current.documents?.[index]?.id || 'pending-' + index,
        sourceDomain: (() => { try { return new URL(item.url).hostname } catch { return '' } })(), sortOrder: index,
      })),
      verificationEvidenceType: 'none', verificationEvidenceUrl: '', verificationStatus: 'unverified', verified: false,
    } : current)
    setNotice(result.data.message)
    if (uploadError) setUploadStatus(`Property details saved. ${completed} photo(s) uploaded; remaining uploads failed: ${uploadError}`)
    else if (completed) setUploadStatus(`${completed} new photo(s) uploaded to ImageKit.`)
  }

  if (loading) return <main className="page-shell"><div className="container"><p className="status-message">Loading your listing…</p></div></main>
  if (error && !property) return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Could not load this listing.</h1><p>{error}</p><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link></div></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Edit your listing.</h1><p>Saving changes returns the listing to moderation and resets its verification status until an administrator reviews the updated details.</p></div>
    {property && <form className="form-card edit-listing-form" onSubmit={submit}>
      <div className="edit-listing-meta"><span>Current status: <strong>{property.status}</strong></span><span>Verification status: <strong>{property.verified ? 'Verified' : 'Unverified'}</strong></span><span>Reference: <code>{property.id}</code></span></div>
      <div className="form-grid">
        <div className="form-field"><label htmlFor="edit-purpose">Purpose</label><select className="form-control" id="edit-purpose" value={purpose} onChange={event => setPurpose(event.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div>
        <div className="form-field"><label htmlFor="edit-type">Property type</label><select className="form-control" id="edit-type" value={propertyType} onChange={event => setPropertyType(event.target.value as PropertyType)}>{(['Apartment','House','Villa','Studio','Plot'] as PropertyType[]).map(type => <option key={type} value={type}>{type}</option>)}</select></div>
        <div className="form-field full"><label htmlFor="edit-title">Listing title</label><input className="form-control" id="edit-title" required minLength={6} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-location">Address / neighbourhood</label><input className="form-control" id="edit-location" required maxLength={240} value={location} onChange={event => setLocation(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-city">City</label><input className="form-control" id="edit-city" required maxLength={100} value={city} onChange={event => setCity(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-price">Price (₹)</label><input className="form-control" id="edit-price" type="number" required min="1" max="1000000000" step="1" value={price} onChange={event => setPrice(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-beds">Bedrooms</label><input className="form-control" id="edit-beds" type="number" min="0" max="100" step="1" value={bedrooms} onChange={event => setBedrooms(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-baths">Bathrooms</label><input className="form-control" id="edit-baths" type="number" min="0" max="100" step="1" value={bathrooms} onChange={event => setBathrooms(event.target.value)} /></div>
        <div className="form-field"><label htmlFor="edit-area">Area (sq ft)</label><input className="form-control" id="edit-area" type="number" min="0" max="100000000" step="1" value={area} onChange={event => setArea(event.target.value)} /></div>
        <div className="form-field full"><label htmlFor="edit-description">Description</label><textarea className="form-control" id="edit-description" required minLength={20} maxLength={8000} value={description} onChange={event => setDescription(event.target.value)} /><small>Keep the description accurate and do not include passwords, identity documents, or another person's private data.</small></div>
        <div className="form-field full"><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset></div>
        <section className="media-editor full" aria-labelledby="edit-property-media-heading">
          <h3 id="edit-property-media-heading">Property photos</h3>
          <p className="muted">Existing photos remain in place. New photos upload securely to ImageKit (JPEG, PNG or WebP, up to 8 MB each; five photos maximum).</p>
          <div className="media-url-list">
            {(property.imageMedia || []).map(image => <div className="media-url-row" key={image.id}>
              <a href={image.url} target="_blank" rel="noopener noreferrer">{image.url}</a>
              <button className="btn btn-outline media-remove" type="button" disabled={imageDeleting === image.id || saving} onClick={() => void removeImage(image)}>
                {imageDeleting === image.id ? 'Removing…' : 'Remove photo'}
              </button>
            </div>)}
            {!property.imageMedia?.length && <p className="muted">No property photos have been added.</p>}
          </div>
          <div className="form-field"><label htmlFor="edit-property-image-files">Add more photos</label>
            <input className="form-control" id="edit-property-image-files" type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={event => {
                const selected = Array.from(event.currentTarget.files || [])
                const remaining = Math.max(0, 5 - (property.imageMedia?.length || 0) - newImages.length)
                setNewImages(current => [...current, ...selected].slice(0, remaining))
                event.currentTarget.value = ''
              }} />
            <small>{(property.imageMedia?.length || 0) + newImages.length} of 5 photos selected.</small>
          </div>
          {newImages.map((file, index) => <div className="media-url-row" key={file.name + file.lastModified + index}>
            <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
            <button className="btn btn-outline media-remove" type="button" onClick={() => setNewImages(current => current.filter((_, i) => i !== index))}>Remove</button>
          </div>)}
        </section>
        <section className="verification-editor full" aria-labelledby="edit-seller-documents-heading">
          <h3 id="edit-seller-documents-heading">Seller-hosted property evidence</h3>
          <p className="muted">These original PDF/image links stay on your website. Buyers open them directly and inspect them themselves. Adding a link does not mean ZameenHub has authenticated it.</p>
          {documents.map((document, index) => <div className="form-grid" key={index}>
            <div className="form-field"><label htmlFor={`edit-doc-type-${index}`}>Document format</label><select className="form-control" id={`edit-doc-type-${index}`} value={document.type} onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, type: event.target.value as 'pdf' | 'image' } : item))}><option value="pdf">PDF</option><option value="image">Image</option></select></div>
            <div className="form-field"><label htmlFor={`edit-doc-description-${index}`}>Description</label><input className="form-control" id={`edit-doc-description-${index}`} required minLength={3} maxLength={180} value={document.description} onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></div>
            <div className="form-field full"><label htmlFor={`edit-doc-url-${index}`}>Original HTTPS link</label><input className="form-control" id={`edit-doc-url-${index}`} type="url" required maxLength={1500} value={document.url} onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="https://your-website.com/document.pdf" /></div>
            <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.filter((_, i) => i !== index))}>Remove evidence link</button>
          </div>)}
          {documents.length < 10 && <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.length < 10 ? [...current, { type: 'pdf', description: '', url: '' }] : current)}>Add document link</button>}
        </section>
      </div>
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice} {uploadStatus}</p>}
      <div className="listing-actions"><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>}
  </div></main>
}
