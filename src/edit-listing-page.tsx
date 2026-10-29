import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SectionKicker } from './components'
import type { Property, PropertyType } from './lib/data'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'

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
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [videoUrl, setVideoUrl] = useState('')
  const [verificationEvidenceType, setVerificationEvidenceType] = useState('none')
  const [verificationEvidenceUrl, setVerificationEvidenceUrl] = useState('')

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
      setImageUrls(item.gallery.length ? item.gallery : [''])
      setVideoUrl(item.videoUrl || '')
      setVerificationEvidenceType(item.verificationEvidenceType || 'none')
      setVerificationEvidenceUrl(item.verificationEvidenceUrl || '')
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
    const result = await apiRequest<{ id: string; status: 'published'; verified: false; message: string }>('/api/my/properties/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea,
        description: description.trim(), amenities, images: imageUrls.map(url => url.trim()).filter(Boolean), videoUrl: videoUrl.trim(), verificationEvidenceType, verificationEvidenceUrl: verificationEvidenceUrl.trim(),
      }),
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setProperty(current => current ? { ...current, title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType, price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea, description: description.trim(), amenities, status: result.data.status, gallery: imageUrls.map(url => url.trim()).filter(Boolean), image: imageUrls.map(url => url.trim()).filter(Boolean)[0] || '', videoUrl: videoUrl.trim(), verificationEvidenceType, verificationEvidenceUrl: verificationEvidenceUrl.trim(), verificationStatus: 'unverified', verified: false } : current)
    setNotice(result.data.message)
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
        <section className="media-editor full" aria-labelledby="edit-property-media-heading"><h3 id="edit-property-media-heading">Property photos and video</h3><p className="muted">Public HTTPS URLs are saved in D1; files stay with your chosen host. No uploads or R2 storage. Up to five photos and one video.</p><div className="media-url-list">{imageUrls.map((imageUrl, index) => <div className="media-url-row" key={index}><div className="form-field"><label htmlFor={`edit-property-image-${index}`}>Photo URL {index + 1}</label><input className="form-control" id={`edit-property-image-${index}`} type="url" maxLength={1500} value={imageUrl} onChange={event => setImageUrls(current => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="https://example.com/property-photo.jpg" /></div><button className="btn btn-outline media-remove" type="button" onClick={() => setImageUrls(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove photo URL ${index + 1}`}>Remove</button></div>)}</div>{imageUrls.length < 5 && <button className="btn btn-outline" type="button" onClick={() => setImageUrls(current => current.length < 5 ? [...current, ''] : current)}>Add another photo URL</button>}<div className="form-field"><label htmlFor="edit-property-video">Video URL (optional)</label><input className="form-control" id="edit-property-video" type="url" maxLength={1500} value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="YouTube, Vimeo, or direct .mp4/.webm URL" /></div></section>
        <section className="verification-editor full" aria-labelledby="edit-evidence-heading"><h3 id="edit-evidence-heading">Property verification evidence</h3><p className="muted">Optional public official-record reference. An administrator can use it as one part of a manual verification check. Do not share private identity documents, Aadhaar/PAN numbers, or private file links.</p><div className="form-field"><label htmlFor="edit-evidence-type">Evidence type</label><select className="form-control" id="edit-evidence-type" value={verificationEvidenceType} onChange={event => setVerificationEvidenceType(event.target.value)}><option value="none">No evidence reference yet</option><option value="official_record">Official public land/property record</option><option value="property_tax_record">Public property-tax record</option><option value="registry_reference">Registration/registry reference</option><option value="other_public_record">Other public record</option></select></div><div className="form-field"><label htmlFor="edit-evidence-url">Public evidence URL</label><input className="form-control" id="edit-evidence-url" type="url" maxLength={1500} value={verificationEvidenceUrl} onChange={event => setVerificationEvidenceUrl(event.target.value)} placeholder="https://official-record-portal.example/record" /><small>Saving changes resets manual verification to Unverified until an administrator rechecks the updated details.</small></div></section>
      </div>
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      <div className="listing-actions"><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
    </form>}
  </div></main>
}
