import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { SectionKicker } from './components'
import type { Property, PropertyType } from './lib/data'
import { apiRequest, getSession } from './lib/auth'

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
    const result = await apiRequest<{ id: string; status: 'pending'; message: string; riskLevel?: string }>('/api/my/properties/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({
        title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType,
        price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea,
        description: description.trim(),
      }),
    })
    setSaving(false)
    if (!result.ok) { setError(result.error); return }
    setProperty(current => current ? { ...current, title: title.trim(), location: location.trim(), city: city.trim(), purpose, propertyType, price: numericPrice, bedrooms: numericBeds, bathrooms: numericBaths, area: numericArea, description: description.trim(), status: 'pending' } : current)
    setNotice(result.data.message)
  }

  if (loading) return <main className="page-shell"><div className="container"><p className="status-message">Loading your listing…</p></div></main>
  if (error && !property) return <main className="page-shell"><div className="container"><div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Could not load this listing.</h1><p>{error}</p><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link></div></div></main>

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Listing management</SectionKicker><h1>Edit your listing.</h1><p>Save corrections to your property details. Every edit returns the listing to pending review so changed information is checked before it is public again.</p></div>
    {property && <form className="form-card edit-listing-form" onSubmit={submit}>
      <div className="edit-listing-meta"><span>Current status: <strong>{property.status}</strong></span><span>Reference: <code>{property.id}</code></span></div>
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
      </div>
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      <div className="listing-actions"><Link className="btn btn-outline" to="/my-listings">Back to my listings</Link><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes and resubmit'}</button></div>
    </form>}
  </div></main>
}
