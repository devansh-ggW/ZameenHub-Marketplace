import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'
import { uploadPropertyImage } from './lib/media'
import type { PropertyDocument } from './lib/data'

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
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [documents, setDocuments] = useState<Array<Omit<PropertyDocument, 'id' | 'sourceDomain' | 'sortOrder'>>>([])
  const [uploadStatus, setUploadStatus] = useState('')
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
    const result = await apiRequest<{ id: string; status: 'pending'; verified: false; message?: string }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim(), location: locationText.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: Number(bedrooms), bathrooms: Number(bathrooms), area: Number(area || 0),
        description: description.trim(), amenities, documents,
        verificationEvidenceType: 'none', verificationEvidenceUrl: '',
      }),
    })
    if (result.ok) {
      let uploaded = 0
      let uploadError = ''
      for (const file of imageFiles) {
        const imageResult = await uploadPropertyImage(result.data.id, file)
        if (!imageResult.ok) { uploadError = imageResult.error; break }
        uploaded += 1
      }
      setUploadStatus(uploadError
        ? `Listing saved. ${uploaded} photo(s) uploaded; the remaining photos need retry: ${uploadError}`
        : `${uploaded} photo(s) uploaded to ImageKit.`)
      setNotice(result.data.message ?? 'Your listing is pending moderation.')
    } else if (result.status === 401) {
      navigate('/login?next=' + encodeURIComponent('/list-property'), { replace: true })
      setError(result.error)
    } else setError(result.error)
    setBusy(false)
  }

  if (checking) return <main className="page-shell"><div className="container"><p className="status-message">Checking your account…</p></div></main>
  if (!authorized) return <main className="page-shell"><div className="container"><p className="status-message">Redirecting to sign in…</p></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property owners</SectionKicker><h1>List a property.<br /><span className="serif">With clarity.</span></h1><p>Submit your details and seller-hosted evidence links for review. Your listing appears publicly only after moderation approves it.</p></div>
    <div className="stepper">{steps.map((label, index) => <div className={'step ' + (step === index + 1 ? 'active' : '')} key={label}><span className="mono">0{index + 1}</span> {label}</div>)}</div>
    <form className="form-card" style={{ maxWidth: 820 }} onSubmit={submit}>
      {step === 1 && <><h2>What are you listing?</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-purpose">Purpose</label><select className="form-control" id="listing-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div><div className="form-field"><label htmlFor="listing-type">Property type</label><select className="form-control" id="listing-type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['Apartment', 'House', 'Villa', 'Studio', 'Plot'].map(type => <option key={type}>{type}</option>)}</select></div></div></>}
      {step === 2 && <><h2>Start with the essentials.</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-title">Listing title</label><input className="form-control" id="listing-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear description of the property" /></div><div className="form-field"><label htmlFor="listing-location">Address / neighbourhood</label><input className="form-control" id="listing-location" required maxLength={240} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Neighbourhood, city" /></div><div className="form-field"><label htmlFor="listing-city">City</label><input className="form-control" id="listing-city" required maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="City" /></div><div className="form-field"><label htmlFor="listing-price">Price (₹)</label><input className="form-control" id="listing-price" required type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-beds">Bedrooms</label><input className="form-control" id="listing-beds" type="number" min="0" max="100" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-baths">Bathrooms</label><input className="form-control" id="listing-baths" type="number" min="0" max="100" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-area">Area (sq ft)</label><input className="form-control" id="listing-area" type="number" min="0" max="100000000" value={area} onChange={e => setArea(e.target.value)} /></div></div></>}
      {step === 3 && <><h2>Add the details that help someone decide.</h2><div className="form-field"><label htmlFor="listing-description">Description</label><textarea className="form-control" id="listing-description" maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the layout, condition, nearby conveniences and important details." /><small>Do not include personal documents or sensitive information.</small></div><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset>
      <section className="media-editor" aria-labelledby="property-media-heading">
        <h3 id="property-media-heading">Property photos</h3>
        <p className="muted">Upload up to five JPEG, PNG or WebP photos. Images are stored and delivered by ImageKit. Maximum 8 MB per photo.</p>
        <div className="form-field">
          <label htmlFor="property-image-files">Choose property photos</label>
          <input className="form-control" id="property-image-files" type="file" accept="image/jpeg,image/png,image/webp" multiple
            onChange={event => {
              const selected = Array.from(event.currentTarget.files || [])
              setImageFiles(current => [...current, ...selected].slice(0, 5))
              event.currentTarget.value = ''
            }} />
          <small>{imageFiles.length} of 5 selected. Each file is checked again on the server.</small>
        </div>
        {imageFiles.map((file, index) => <div className="media-url-row" key={file.name + file.lastModified + index}>
          <span>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</span>
          <button className="btn btn-outline media-remove" type="button" onClick={() => setImageFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>)}
      </section>
      <section className="verification-editor" aria-labelledby="seller-documents-heading">
        <h3 id="seller-documents-heading">Seller-hosted property evidence</h3>
        <p className="muted">Add links to PDFs or images hosted on your own website or another website you control. Buyers open the original source themselves. ZameenHub does not download, host or legally authenticate these documents.</p>
        {documents.map((document, index) => <div className="form-grid" key={index}>
          <div className="form-field"><label htmlFor={`seller-doc-type-${index}`}>Document format</label>
            <select className="form-control" id={`seller-doc-type-${index}`} value={document.type}
              onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, type: event.target.value as 'pdf' | 'image' } : item))}>
              <option value="pdf">PDF</option><option value="image">Image</option>
            </select>
          </div>
          <div className="form-field"><label htmlFor={`seller-doc-description-${index}`}>Description</label>
            <input className="form-control" id={`seller-doc-description-${index}`} maxLength={180} minLength={3} required value={document.description}
              onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} placeholder="e.g. Property tax receipt" />
          </div>
          <div className="form-field full"><label htmlFor={`seller-doc-url-${index}`}>Original HTTPS link</label>
            <input className="form-control" id={`seller-doc-url-${index}`} type="url" maxLength={1500} required value={document.url}
              onChange={event => setDocuments(current => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="https://your-website.com/property-document.pdf" />
          </div>
          <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.filter((_, i) => i !== index))}>Remove evidence link</button>
        </div>)}
        {documents.length < 10 && <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.length < 10 ? [...current, { type: 'pdf', description: '', url: '' }] : current)}>Add document link</button>}
        <p className="muted">Use direct links that open on your source website. HTTPS is required. Do not share Aadhaar/PAN or another person's private identity information.</p>
      </section></>}
      {step === 4 && <><h2>Review before submission.</h2><p><strong>{title || 'Untitled property'}</strong></p><p className="muted">{locationText}{city ? ', ' + city : ''} · {purpose === 'sale' ? 'For sale' : 'For rent'} · ₹{Number(price || 0).toLocaleString('en-IN')}</p>{amenities.length > 0 && <p><strong>Amenities:</strong> {amenities.join(', ')}</p>}<p><strong>Photos:</strong> {imageFiles.length} of 5 · <strong>Evidence links:</strong> {documents.length} of 10</p><p className="status-message">Your listing will be pending moderation after submission. Evidence links remain on their original website; adding them does not mean ZameenHub has authenticated them.</p></>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <div className="status-message success" role="status">{notice} {uploadStatus && <span>{uploadStatus} </span>}<a href="/my-listings">View my listings</a></div>}
      <div className="listing-actions"><button className="btn btn-outline" type="button" disabled={step === 1 || busy} onClick={() => setStep(Math.max(1, step - 1))}>Back</button>{!notice && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 4 ? 'Publish listing' : 'Continue'}</button>}</div>
    </form>
  </div></main>
}
