import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, getSession } from './lib/auth'

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
    const result = await apiRequest<{ id: string; status: 'pending'; riskLevel?: string; riskScore?: number; riskReasons?: string[]; reviewMessage?: string }>('/api/properties', {
      method: 'POST',
      body: JSON.stringify({ title: title.trim(), location: locationText.trim(), city: city.trim(), purpose, propertyType, price: numericPrice, bedrooms: Number(bedrooms), bathrooms: Number(bathrooms), area: Number(area || 0), description: description.trim(), amenities: [] }),
    })
    setBusy(false)
    if (result.ok) setNotice(result.data.reviewMessage ?? 'Your listing has been submitted for review. It will not appear publicly until approved.')
    else if (result.status === 401) navigate('/login?next=' + encodeURIComponent('/list-property'), { replace: true })
    else setError(result.error)
  }

  if (checking) return <main className="page-shell"><div className="container"><p className="status-message">Checking your account…</p></div></main>
  if (!authorized) return <main className="page-shell"><div className="container"><p className="status-message">Redirecting to sign in…</p></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property owners</SectionKicker><h1>List a property.<br /><span className="serif">With clarity.</span></h1><p>Sign-in is required. Every new listing stays pending until an authorized reviewer approves it.</p></div>
    <div className="stepper">{steps.map((label, index) => <div className={'step ' + (step === index + 1 ? 'active' : '')} key={label}><span className="mono">0{index + 1}</span> {label}</div>)}</div>
    <form className="form-card" style={{ maxWidth: 820 }} onSubmit={submit}>
      {step === 1 && <><h2>What are you listing?</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-purpose">Purpose</label><select className="form-control" id="listing-purpose" value={purpose} onChange={e => setPurpose(e.target.value as 'sale' | 'rent')}><option value="sale">For sale</option><option value="rent">For rent</option></select></div><div className="form-field"><label htmlFor="listing-type">Property type</label><select className="form-control" id="listing-type" value={propertyType} onChange={e => setPropertyType(e.target.value)}>{['Apartment', 'House', 'Villa', 'Studio', 'Plot'].map(type => <option key={type}>{type}</option>)}</select></div></div></>}
      {step === 2 && <><h2>Start with the essentials.</h2><div className="form-grid"><div className="form-field"><label htmlFor="listing-title">Listing title</label><input className="form-control" id="listing-title" required minLength={6} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="A clear description of the property" /></div><div className="form-field"><label htmlFor="listing-location">Address / neighbourhood</label><input className="form-control" id="listing-location" required maxLength={240} value={locationText} onChange={e => setLocationText(e.target.value)} placeholder="Neighbourhood, city" /></div><div className="form-field"><label htmlFor="listing-city">City</label><input className="form-control" id="listing-city" maxLength={100} value={city} onChange={e => setCity(e.target.value)} placeholder="City" /></div><div className="form-field"><label htmlFor="listing-price">Price (₹)</label><input className="form-control" id="listing-price" required type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-beds">Bedrooms</label><input className="form-control" id="listing-beds" type="number" min="0" max="100" value={bedrooms} onChange={e => setBedrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-baths">Bathrooms</label><input className="form-control" id="listing-baths" type="number" min="0" max="100" value={bathrooms} onChange={e => setBathrooms(e.target.value)} /></div><div className="form-field"><label htmlFor="listing-area">Area (sq ft)</label><input className="form-control" id="listing-area" type="number" min="0" max="100000000" value={area} onChange={e => setArea(e.target.value)} /></div></div></>}
      {step === 3 && <><h2>Add the details that help someone decide.</h2><div className="form-field"><label htmlFor="listing-description">Description</label><textarea className="form-control" id="listing-description" maxLength={8000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the layout, condition, nearby conveniences and important details." /><small>Do not include personal documents or sensitive information.</small></div><p className="muted">Photos can be added once owner-managed image storage is enabled for this deployment.</p></>}
      {step === 4 && <><h2>Review before submission.</h2><p><strong>{title || 'Untitled property'}</strong></p><p className="muted">{locationText}{city ? ', ' + city : ''} · {purpose === 'sale' ? 'For sale' : 'For rent'} · ₹{Number(price || 0).toLocaleString('en-IN')}</p><p className="status-message">Submission creates a pending listing. It does not publish it or claim that property documents have been independently verified.</p></>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <div className="status-message success" role="status">{notice} <a href="/my-listings">View my listings</a></div>}
      <div className="listing-actions"><button className="btn btn-outline" type="button" disabled={step === 1 || busy} onClick={() => setStep(Math.max(1, step - 1))}>Back</button>{!notice && <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : step === 4 ? 'Submit for review' : 'Continue'}</button>}</div>
    </form>
  </div></main>
}
