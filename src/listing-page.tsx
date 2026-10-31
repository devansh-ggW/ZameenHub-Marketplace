import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'
import { PROPERTY_AMENITIES } from './lib/property-options'
import { uploadPropertyImage } from './lib/imagekit'

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
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatus, setUploadStatus] = useState('')
  const [documents, setDocuments] = useState<Array<{ documentType: 'pdf' | 'image'; description: string; url: string }>>([])
  const steps = ['Purpose', 'Details', 'Photos & documents']
  const [verificationEvidenceType, setVerificationEvidenceType] = useState('none')
  const [verificationEvidenceUrl, setVerificationEvidenceUrl] = useState('')

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
    if (step < 3) { setStep(step + 1); return }
    const numericPrice = Number(price)
    if (!title.trim() || title.trim().length < 6 || !locationText.trim() || !city.trim() || description.trim().length < 20 || !Number.isSafeInteger(numericPrice) || numericPrice < 1) {
      setError('Enter a clear title, location, city, a valid positive price, and a description of at least 20 characters.')
      setStep(2); return
    }
    const publicDocuments = documents.filter(item => item.url.trim() && item.description.trim()).map(item => ({ ...item, url: item.url.trim(), description: item.description.trim() }))
    if (imageFiles.length === 0) { setError('Upload at least one property photo before submitting.'); return }
    if (publicDocuments.length === 0) { setError('Add at least one seller-provided property document link before submitting.'); return }

    setBusy(true)
    setUploadStatus('')
    const result = await apiRequest<{ id: string; status: 'draft'; verified: false; message?: string }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify({
        title: title.trim(), location: locationText.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: Number(bedrooms), bathrooms: Number(bathrooms), area: Number(area || 0),
        description: description.trim(), amenities,
        documents: publicDocuments,
        verificationEvidenceType, verificationEvidenceUrl: verificationEvidenceUrl.trim(),
      }),
    })
    if (!result.ok) {
      setBusy(false)
      if (result.status === 401) navigate('/login?next=' + encodeURIComponent('/list-property'), { replace: true })
      else setError(result.error)
      return
    }

    const knownMediaIds = new Set<string>()
    for (let index = 0; index < imageFiles.length; index++) {
      setUploadStatus('Uploading image ' + (index + 1) + ' of ' + imageFiles.length)
      const uploaded = await uploadPropertyImage(result.data.id, imageFiles[index], setUploadProgress, [...knownMediaIds])
      if (!uploaded.ok) {
        setBusy(false)
        setError('Your listing was created, but image ' + (index + 1) + ' could not be confirmed: ' + uploaded.error + ' You can retry from Edit listing.')
        setNotice('Listing created successfully. Check the photo gallery before retrying this image.')
        return
      }
      knownMediaIds.add(uploaded.data.id)
      setUploadProgress(0)
    }
    const publication = await apiRequest<{ id: string; status: 'published'; message: string }>('/api/my/properties/' + encodeURIComponent(result.data.id) + '/publish', { method: 'POST' })
    setBusy(false)
    if (!publication.ok) {
      setError('Your draft is saved, but it could not be published: ' + publication.error)
      setNotice('Your listing remains private. Check that it has at least one photo and one seller-provided document.')
      return
    }
    setNotice(publication.data.message)
    setUploadStatus('All photos uploaded and listing published.')
  }

  if (checking) return <main className="page-shell"><div className="container"><p className="status-message">Checking your account…</p></div></main>
  if (!authorized) return <main className="page-shell"><div className="container"><p className="status-message">Redirecting to sign in…</p></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property owners</SectionKicker><h1>List a property.<br /><span className="serif">With clarity.</span></h1><p>Sign-in is required. A listing is published after at least one property photo and one seller-provided PDF/image document are saved. It remains Unverified until an administrator manually checks the details.</p></div>
    <div className="stepper">{steps.map((label, index) => <div className={'step ' + (step === index + 1 ? 'active' : '')} key={label}><span className="mono">0{index + 1}</span> {label}</div>)}</div>
    <form className="form-card" style={{ maxWidth: 820 }} onSubmit={submit}>
      {step === 1 && <><h2>What are you listing?</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-purpose">Purpose</label><select className="form-control" id="listing-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div><div className="form-field"><label htmlFor="listing-type">Property type</label><select className="form-control" id="listing-type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['Apartment', 'House', 'Villa', 'Studio', 'Plot'].map(type => <option key={type}>{type}</option>)}</select></div></div></>}
      {step === 2 && <><h2>Start with the essentials.</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-title">Listing title</label><input className="form-control" id="listing-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear description of the property" /></div><div className="form-field"><label htmlFor="listing-location">Address / neighbourhood</label><input className="form-control" id="listing-location" required maxLength={240} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Neighbourhood, city" /></div><div className="form-field"><label htmlFor="listing-city">City</label><input className="form-control" id="listing-city" required maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="City" /></div><div className="form-field"><label htmlFor="listing-price">Price (₹)</label><input className="form-control" id="listing-price" required type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-beds">Bedrooms</label><input className="form-control" id="listing-beds" type="number" min="0" max="100" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-baths">Bathrooms</label><input className="form-control" id="listing-baths" type="number" min="0" max="100" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-area">Area (sq ft)</label><input className="form-control" id="listing-area" type="number" min="0" max="100000000" value={area} onChange={e => setArea(e.target.value)} /></div></div></>}
      {step === 3 && <><h2>Add the details that help someone decide.</h2><div className="form-field"><label htmlFor="listing-description">Description</label><textarea className="form-control" id="listing-description" maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the layout, condition, nearby conveniences and important details." /><small>Do not include personal documents or sensitive information.</small></div><fieldset className="amenity-picker"><legend>Property amenities</legend><p className="muted">Select only features that are genuinely available at this property.</p><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={amenities.includes(amenity)} onChange={event => setAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></fieldset>
      <section className="media-editor" aria-labelledby="property-media-heading">
        <h3 id="property-media-heading">Property photos</h3>
        <p className="muted">At least one photo is required for public publishing. Upload up to five JPEG, PNG or WebP photos. ZameenHub stores the media in ImageKit and keeps only the file reference in D1. Maximum 10 MB per image.</p>
        <div className="form-field">
          <label htmlFor="property-images">Choose property photos</label>
          <input className="form-control" id="property-images" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => {
            const files = Array.from(event.target.files || []).slice(0, 5)
            if (files.some(file => file.size > 10 * 1024 * 1024)) { setError('Each photo must be 10 MB or smaller.'); event.target.value = ''; return }
            setImageFiles(files); setError('')
          }} />
          <small>{imageFiles.length} of 5 photos selected.</small>
        </div>
        {uploadStatus && <p className="status-message" role="status">{uploadStatus}{busy && imageFiles.length > 0 ? ' · ' + uploadProgress + '%' : ''}</p>}
      </section>
      <section className="verification-editor" aria-labelledby="property-documents-heading">
        <h3 id="property-documents-heading">Property documents</h3>
        <p className="muted">At least one supporting property document is required for public publishing. Add an original HTTPS link to a seller-hosted PDF or image, such as a registered deed copy, property-tax receipt or registry extract. Buyers inspect the source themselves; ZameenHub does not download, store or legally authenticate these documents.</p>
        {documents.map((document, index) => <div className="media-url-row" key={index}>
          <div className="form-field"><label htmlFor={`property-document-type-${index}`}>Seller-declared format</label><select className="form-control" id={`property-document-type-${index}`} value={document.documentType} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, documentType: event.target.value as 'pdf' | 'image' } : item))}><option value="pdf">PDF</option><option value="image">Image</option></select></div>
          <div className="form-field"><label htmlFor={`property-document-description-${index}`}>What does this document represent?</label><input className="form-control" id={`property-document-description-${index}`} value={document.description} maxLength={180} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="e.g. Sale deed / property tax receipt" /></div>
          <div className="form-field"><label htmlFor={`property-document-url-${index}`}>Original HTTPS link</label><input className="form-control" id={`property-document-url-${index}`} type="url" maxLength={2000} value={document.url} onChange={event => setDocuments(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://yourwebsite.example/documents/record.pdf" /></div>
          <button className="btn btn-outline media-remove" type="button" onClick={() => setDocuments(current => current.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
        </div>)}
        {documents.length < 10 && <button className="btn btn-outline" type="button" onClick={() => setDocuments(current => current.length < 10 ? [...current, { documentType: 'pdf', description: '', url: '' }] : current)}>Add document link</button>}
        <small>HTTPS only · up to 10 links · never share Aadhaar/PAN or private identity information.</small>
      </section>
      <section className="verification-editor" aria-labelledby="verification-evidence-heading">
        <h3 id="verification-evidence-heading">Private review reference (optional)</h3>
        <p className="muted">This optional HTTPS reference is shared only with the owner and authorized reviewers. Buyers inspect the separate PDF/image document links above on the seller's website. Neither a reference nor a listing badge proves legal ownership.</p>
        <div className="form-field">
          <label htmlFor="evidence-type">Evidence type</label>
          <select className="form-control" id="evidence-type" value={verificationEvidenceType} onChange={event => setVerificationEvidenceType(event.target.value)}>
            <option value="none">No private reference</option>
            <option value="official_record">Official public land/property record</option>
            <option value="property_tax_record">Public property-tax record</option>
            <option value="registry_reference">Registration/registry reference</option>
            <option value="other_public_record">Other public record</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="evidence-url">Private review reference URL</label>
          <input className="form-control" id="evidence-url" type="url" maxLength={1500} value={verificationEvidenceUrl} onChange={event => setVerificationEvidenceUrl(event.target.value)} placeholder="https://official-record-portal.example/record" />
          <small>Do not submit private identity records, Aadhaar/PAN details or credentials.</small>
        </div>
      </section>
    </>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <div className="status-message success" role="status">{notice} <a href="/my-listings">View my listings</a></div>}
      <div className="listing-actions"><button className="btn btn-outline" type="button" disabled={step === 1 || busy} onClick={() => setStep(Math.max(1, step - 1))}>Back</button>{!notice && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 3 ? 'Publish listing' : 'Continue'}</button>}</div>
    </form>
  </div></main>
}
