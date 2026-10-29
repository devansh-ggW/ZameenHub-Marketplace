import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'

export function ListingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [checking, setChecking] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState(1)
  const [purpose, setPurpose] = useState<'sale' | 'rent'>('sale')
  const [propertyType, setPropertyType] = useState('Apartment')
  const [title, setTitle] = useState('')
  const [locationText, setLocationText] = useState('')
  const [city, setCity] = useState('')
  const [price, setPrice] = useState('')
  const [bedrooms, setBedrooms] = useState('0')
  const [bathrooms, setBathrooms] = useState('0')
  const [area, setArea] = useState('')
  const [description, setDescription] = useState('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([''])
  const [videoUrl, setVideoUrl] = useState('')
  const [verificationEvidenceType, setVerificationEvidenceType] = useState('none')
  const [verificationEvidenceUrl, setVerificationEvidenceUrl] = useState('')
  const steps = ['Purpose', 'Details', 'Description', 'Review']

  useEffect(() => {
    let current = true
    void getSession().then(result => {
      if (!current) return
      setChecking(false)
      if (result.ok && result.data.authenticated) setAuthorized(true)
      else navigate('/login?next=' + encodeURIComponent(location.pathname + location.search), { replace: true })
    })
    return () => { current = false }
  }, [navigate, location.pathname, location.search])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    if (step < 4) { setStep(step + 1); return }
    const numericPrice = Number(price)
    if (!title.trim() || title.trim().length < 6 || !locationText.trim() || !city.trim() || description.trim().length < 20 || !Number.isSafeInteger(numericPrice) || numericPrice < 1) {
      setError('Enter a clear title, location, city, a valid positive price, and a description of at least 20 characters.')
      setStep(2); return
    }
    setBusy(true)
    const result = await apiRequest<{ id: string; status: 'pending' | 'published'; aiScreened?: boolean; message?: string }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim(), location: locationText.trim(), city: city.trim(), purpose, propertyType, price: numericPrice, bedrooms: Number(bedrooms), bathrooms: Number(bathrooms), area: Number(area || 0), description: description.trim(), amenities, images: imageUrls.map(url => url.trim()).filter(Boolean), videoUrl: videoUrl.trim(), verificationEvidenceType, verificationEvidenceUrl: verificationEvidenceUrl.trim() }),
    })
    setBusy(false)
    if (result.ok) setNotice(result.data.message ?? 'Your listing has been submitted. Automated text and duplicate checks may publish low-risk listings; otherwise, it remains private for review.')
    else if (result.status === 401) navigate('/login?next=' + encodeURIComponent('/list-property'), { replace: true })
    else setError(result.error)
  }

  if (checking) return <main className="page-shell"><div className="container"><p className="status-message">Checking your account…</p></div></main>
  if (!authorized) return <main className="page-shell"><div className="container"><p className="status-message">Redirecting to sign in…</p></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property owners</SectionKicker><h1>List a property.<br /><span className="serif">With clarity.</span></h1><p>Sign-in is required. Automated text and duplicate checks may publish low-risk, non-duplicate submissions. Other listings stay private for review. Automated checks do not prove ownership.</p></div>
    <div className="stepper">{steps.map((label, index) => <div className={'step ' + (step === index + 1 ? 'active' : '')} key={label}><span className="mono">0{index + 1}</span> {label}</div>)}</div>
    <form className="form-card" style={{ maxWidth: 820 }} onSubmit={submit}>
      {step === 1 && <><h2>What are you listing?</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-purpose">Purpose</label><select className="form-control" id="listing-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div><div className="form-field"><label htmlFor="listing-type">Property type</label><select className="form-control" id="listing-type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['Apartment', 'House', 'Villa', 'Studio', 'Plot'].map(type => <option key={type}>{type}</option>)}</select></div></div></>}
      {step === 2 && <><h2>Start with the essentials.</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-title">Listing title</label><input className="form-control" id="listing-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear description of the property" /></div><div className="form-field"><label htmlFor="listing-location">Address / neighbourhood</label><input className="form-control" id="listing-location" required maxLength={240} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Neighbourhood, city" /></div><div className="form-field"><label htmlFor="listing-city">City</label><input className="form-control" id="listing-city" maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="City" /></div><div className="form-field"><label htmlFor="listing-price">Price (₹)</label><input className="form-control" id="listing-price" required type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-beds">Bedrooms</label><input className="form-control" id="listing-beds" type="number" min="0" max="100" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-baths">Bathrooms</label><input className="form-control" id="listing-baths" type="number" min="0" max="100" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-area">Area (sq ft)</label><input className="form-control" id="listing-area" type="number" min="0" max="100000000" value={area} onChange={e => setArea(e.target.value)} /></div></div></>}
      {step === 3 && <><h2>Add the details that help someone decide.</h2><div className="form-field"><label htmlFor="listing-description">Description</label><textarea className="form-control" id="listing-description" maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the layout, condition, nearby conveniences and important details." /><small>Do not include personal documents or sensitive information.</small></div><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset>
      <section className="media-editor" aria-labelledby="property-media-heading"><h3 id="property-media-heading">Property photos and video</h3><p className="muted">Paste public HTTPS URLs. ZameenHub stores the URLs in D1; the files stay on the host you choose. No R2 bucket or file upload is used. Keep links public and stable.</p><div className="media-url-list">{imageUrls.map((imageUrl, index) => <div className="media-url-row" key={index}><div className="form-field"><label htmlFor={`property-image-${index}`}>Photo URL {index + 1}</label><input className="form-control" id={`property-image-${index}`} type="url" maxLength={1500} value={imageUrl} onChange={event => setImageUrls(current => current.map((value, itemIndex) => itemIndex === index ? event.target.value : value))} placeholder="https://example.com/property-photo.jpg" /></div><button className="btn btn-outline media-remove" type="button" onClick={() => setImageUrls(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove photo URL ${index + 1}`}>Remove</button></div>)}</div>{imageUrls.length < 5 && <button className="btn btn-outline" type="button" onClick={() => setImageUrls(current => current.length < 5 ? [...current, ''] : current)}>Add another photo URL</button>}<div className="form-field" style={{ marginTop: 18 }}><label htmlFor="property-video">Video URL (optional)</label><input className="form-control" id="property-video" type="url" maxLength={1500} value={videoUrl} onChange={event => setVideoUrl(event.target.value)} placeholder="YouTube, Vimeo, or direct .mp4/.webm URL" /><small>One video per property. Use a public HTTPS YouTube/Vimeo link or a direct MP4, WebM, Ogg or HLS URL.</small></div></section>
      <section className="verification-editor" aria-labelledby="verification-evidence-heading"><h3 id="verification-evidence-heading">Property verification evidence (optional)</h3><p className="muted">Provide a public reference to an official registry/record if available. Reviewers inspect the link; an AI score or URL alone cannot prove title or ownership. Never paste Aadhaar/PAN numbers, personal identity documents, or private document links.</p><div className="form-field"><label htmlFor="evidence-type">Evidence type</label><select className="form-control" id="evidence-type" value={verificationEvidenceType} onChange={event => setVerificationEvidenceType(event.target.value)}><option value="none">No evidence reference yet</option><option value="official_record">Official public land/property record</option><option value="property_tax_record">Public property-tax record</option><option value="registry_reference">Registration/registry reference</option><option value="other_public_record">Other public record</option></select></div><div className="form-field"><label htmlFor="evidence-url">Public evidence URL</label><input className="form-control" id="evidence-url" type="url" maxLength={1500} value={verificationEvidenceUrl} onChange={event => setVerificationEvidenceUrl(event.target.value)} placeholder="https://official-record-portal.example/record" /><small>The status remains pending until a moderator reviews the listing. Evidence is never shown publicly.</small></div></section></>}
      {step === 4 && <><h2>Review before submission.</h2><p><strong>{title || 'Untitled property'}</strong></p><p className="muted">{locationText}{city ? ', ' + city : ''} · {purpose === 'sale' ? 'For sale' : 'For rent'} · ₹{Number(price || 0).toLocaleString('en-IN')}</p>{amenities.length > 0 && <p><strong>Amenities:</strong> {amenities.join(', ')}</p>}<p><strong>Photos:</strong> {imageUrls.filter(url => url.trim()).length} of 5 · <strong>Video:</strong> {videoUrl.trim() ? 'added' : 'not added'}</p><p className="status-message">Automated text and duplicate checks may publish a listing when it meets the low-risk criteria. Otherwise, it stays private for review. Automated checks and a submitted URL are not proof of ownership; verify details independently.</p></>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <div className="status-message success" role="status">{notice} <a href="/my-listings">View my listings</a></div>}
      <div className="listing-actions"><button className="btn btn-outline" type="button" disabled={step === 1 || busy} onClick={() => setStep(Math.max(1, step - 1))}>Back</button>{!notice && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 4 ? 'Submit for review' : 'Continue'}</button>}</div>
    </form>
  </div></main>
}
