import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { CinematicScrollExperience, EmptyState, ErrorState, FavoriteButton, ImageWithFallback, Lightbox, LoadingState, PropertyCard, PropertySearch, SectionKicker, ScrollScene } from './components'
import { categories, formatPrice, images, type Property } from './lib/data'
import { getProperties, getProperty, submitInquiry } from './lib/api'
import { ReportProperty } from './report-property'

export function HomePage() {
  const [recent, setRecent] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getProperties(new URLSearchParams()).then(result => {
      if (!active) return
      if (result.ok) { setRecent(result.data.slice(0, 3)); setError('') }
      else setError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  return <main className="home-page">
    <section className="hero"><div className="hero-media"><ImageWithFallback src={images.hero} alt="Contemporary residential architecture" className="hero-image" /></div><div className="hero-overlay" aria-hidden="true" /><div className="hero-grid"><div className="hero-copy"><SectionKicker>Property discovery · made clearer</SectionKicker><h1 className="display">Find your next<br /><span className="serif">chapter.</span></h1><p>Explore published properties with details you can compare. No invented availability, no made-up seller claims.</p><PropertySearch /></div><div className="hero-rail">Search · Compare · Connect</div></div></section>
    <CinematicScrollExperience />
    <ScrollScene variant="reveal" className="discovery-section"><section className="section"><div className="container">
      <div className="section-head"><div><SectionKicker>Property discovery</SectionKicker><h2>Search what is<br /><span className="serif">actually available.</span></h2></div><p>Recently published properties come directly from ZameenHub’s property service. Only approved listings appear here; if there are none, we say so instead of inventing inventory.</p></div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : recent.length > 0 ? <div className="property-grid">{recent.map(property => <PropertyCard property={property} key={property.id} />)}</div> : <EmptyState title="No published properties yet." copy="There are no public listings right now. Property owners can submit a listing, which stays private until it passes marketplace review." />}
      <div style={{ marginTop: 30 }}><Link to="/properties" className="btn btn-primary">Open property search <ArrowUpRight size={16} /></Link></div>
    </div></section></ScrollScene>
    <ScrollScene variant="quiet" className="category-section"><section className="section" style={{ paddingTop: 20 }}><div className="container"><div className="section-head"><div><SectionKicker>Search vocabulary</SectionKicker><h2>Begin with an<br /><span className="serif">intent.</span></h2></div><p>These are search paths, not claims about inventory. The results page always reflects the actual records returned by the property service.</p></div><div className="category-grid">{categories.map(category => <Link className="category" key={category.label} to={`/properties?type=${category.label === 'Rentals' ? '' : category.label.slice(0, -1)}`}><span className="category-symbol">{category.icon}</span><h3>{category.label}</h3><p>Search {category.label.toLowerCase()} <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} /></p></Link>)}</div></div></section></ScrollScene>
    <ScrollScene variant="lift" className="process-section"><section className="section"><div className="container editorial-split"><div className="section-number mono"><span>How it works</span><span>03 / 03</span></div><div><SectionKicker>A simpler rhythm</SectionKicker><h2 style={{ fontSize: 'clamp(2.6rem, 5vw, 5.6rem)', letterSpacing: '-.075em', lineHeight: .93, margin: '18px 0 30px' }}>Search with context.<br /><span className="serif">Decide with clarity.</span></h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}><div><span className="mono" style={{ color: 'var(--blue)' }}>01</span><h3>Explore</h3><p className="muted">Start with a place, a feeling, or a practical need.</p></div><div><span className="mono" style={{ color: 'var(--blue)' }}>02</span><h3>Compare</h3><p className="muted">Keep the details returned by the property service in view.</p></div><div><span className="mono" style={{ color: 'var(--blue)' }}>03</span><h3>Connect</h3><p className="muted">Reach a listing owner only when a real record is available.</p></div></div></div></div></section></ScrollScene>
    <ScrollScene variant="depth" className="closing-section"><section className="section blue-band"><div className="container cta-grid"><div><SectionKicker>For property owners</SectionKicker><h2>List the place<br /><span className="serif">that matters.</span></h2></div><div><p style={{ fontSize: 18, lineHeight: 1.65 }}>Create a listing, add the details that matter, and submit it through the configured review workflow. ZameenHub does not promise instant publishing or leads.</p><Link to="/list-property" className="btn btn-outline" style={{ marginTop: 22 }}>Start a listing <ArrowUpRight size={16} /></Link></div></div></section></ScrollScene>
  </main>
}

export function PropertiesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState(searchParams.get('q') ?? '')
  const [purpose, setPurpose] = useState(searchParams.get('purpose') ?? '')
  const [type, setType] = useState(searchParams.get('type') ?? '')
  const [sort, setSort] = useState(searchParams.get('sort') ?? 'newest')
  const [beds, setBeds] = useState(searchParams.get('beds') ?? '')
  const [baths, setBaths] = useState(searchParams.get('baths') ?? '')
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') ?? '')
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '')
  const [minArea, setMinArea] = useState(searchParams.get('minArea') ?? '')

  function apply(event?: FormEvent) {
    event?.preventDefault()
    const next = new URLSearchParams()
    if (q.trim()) next.set('q', q.trim())
    if (purpose) next.set('purpose', purpose)
    if (type) next.set('type', type)
    if (beds) next.set('beds', beds)
    if (baths) next.set('baths', baths)
    if (minPrice) next.set('minPrice', minPrice)
    if (maxPrice) next.set('maxPrice', maxPrice)
    if (minArea) next.set('minArea', minArea)
    if (sort !== 'newest') next.set('sort', sort)
    setSearchParams(next)
  }

  function clearAll() {
    setQ(''); setPurpose(''); setType(''); setBeds(''); setBaths('')
    setMinPrice(''); setMaxPrice(''); setMinArea(''); setSort('newest')
    setSearchParams({})
  }

  useEffect(() => {
    setQ(searchParams.get('q') ?? '')
    setPurpose(searchParams.get('purpose') ?? '')
    setType(searchParams.get('type') ?? '')
    setSort(searchParams.get('sort') ?? 'newest')
    setBeds(searchParams.get('beds') ?? '')
    setBaths(searchParams.get('baths') ?? '')
    setMinPrice(searchParams.get('minPrice') ?? '')
    setMaxPrice(searchParams.get('maxPrice') ?? '')
    setMinArea(searchParams.get('minArea') ?? '')
  }, [searchParams])

  useEffect(() => {
    let active = true
    setLoading(true)
    getProperties(searchParams).then(result => {
      if (!active) return
      if (result.ok) { setItems(result.data); setError('') }
      else setError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [searchParams])

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Property discovery</SectionKicker><h1>Find a place<br /><span className="serif">with context.</span></h1><p>Compare available listings by location, budget, home size and the practical details that matter to you.</p></div>
    <form className="filters-bar" onSubmit={apply}>
      <div className="filter-item"><label htmlFor="q">Location / keyword</label><input id="q" value={q} onChange={e => setQ(e.target.value)} maxLength={120} placeholder="Mumbai, Bandra..." /></div>
      <div className="filter-item"><label htmlFor="purpose">Purpose</label><select id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)}><option value="">Buy or rent</option><option value="sale">Buy</option><option value="rent">Rent</option></select></div>
      <div className="filter-item"><label htmlFor="type">Type</label><select id="type" value={type} onChange={e => setType(e.target.value)}><option value="">Any type</option><option>Apartment</option><option>House</option><option>Villa</option><option>Studio</option><option>Plot</option></select></div>
      <div className="filter-item"><label htmlFor="min-price">Minimum budget (₹)</label><input id="min-price" type="number" min="0" max="1000000000" step="1" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="No minimum" /></div>
      <div className="filter-item"><label htmlFor="max-price">Maximum budget (₹)</label><input id="max-price" type="number" min="0" max="1000000000" step="1" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="No maximum" /></div>
      <div className="filter-item"><label htmlFor="beds">Bedrooms</label><select id="beds" value={beds} onChange={e => setBeds(e.target.value)}><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>
      <div className="filter-item"><label htmlFor="baths">Bathrooms</label><select id="baths" value={baths} onChange={e => setBaths(e.target.value)}><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select></div>
      <div className="filter-item"><label htmlFor="min-area">Minimum area (sq ft)</label><input id="min-area" type="number" min="0" max="100000000" step="1" value={minArea} onChange={e => setMinArea(e.target.value)} placeholder="Any size" /></div>
      <div className="filter-item"><label htmlFor="sort">Sort</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></div>
      <button className="btn btn-primary" type="submit">Apply filters</button>
      <button className="btn" type="button" onClick={clearAll}>Clear all</button>
    </form>
    <div className="results-head"><span className="mono">{loading ? 'Searching...' : `${items.length} properties`}</span><span className="muted" style={{ fontSize: 12 }}>Published listings only</span></div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : items.length ? <div className="property-grid">{items.map(property => <PropertyCard property={property} key={property.id} />)}</div> : <>
      <EmptyState title="No properties match those filters." copy="Try a broader location, adjust your budget, or clear a filter. New submissions remain private while pending review." />
      <div className="listing-visibility-help"><p><strong>Recently submitted a property?</strong> It may already be saved to your account but will not appear here until a reviewer approves it.</p><Link to="/my-listings" className="btn btn-outline">Check my listings <ArrowUpRight size={15} /></Link></div>
    </>}
  </div></main>
}

export function PropertyDetailPage() { const { slug = '' } = useParams(); const [property, setProperty] = useState<Property | null>(null); const [error, setError] = useState(''); const [lightbox, setLightbox] = useState<string | null>(null); const [message, setMessage] = useState(''); const [notice, setNotice] = useState(''); const [email, setEmail] = useState(''); const [sending, setSending] = useState(false); useEffect(() => { getProperty(slug).then((result) => result.ok ? setProperty(result.data) : setError(result.error)) }, [slug]); if (error) return <main className="page-shell"><div className="container"><EmptyState title="This property is unavailable." copy={error} /></div></main>; if (!property) return <main className="page-shell"><div className="container"><LoadingState /></div></main>; const send = async (event: FormEvent) => { event.preventDefault(); setSending(true); const result = await submitInquiry({ propertyId: property.id, message, email }); setSending(false); if (result.ok) { setNotice((result.data.notificationSent ? 'Your inquiry was sent to the listing owner. ' : 'Your inquiry was saved, but an email notification could not be delivered. ') + 'Reference: ' + result.data.reference); setEmail(''); setMessage('') } else setNotice(result.error) }; return <main className="page-shell"><div className="container"><Link to="/properties" className="mono" style={{ color: 'var(--blue)' }}><ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Back to properties</Link><div className="detail-grid" style={{ marginTop: 28 }}><div>{property.gallery.length ? <div className="gallery">{property.gallery.map((image, index) => <ImageWithFallback key={image} src={image} alt={`${property.title} view ${index + 1}`} className="gallery-image" onClick={() => setLightbox(image)} />)}</div> : <div className="gallery-empty">No property photos supplied by the owner.</div>}<div className="detail-section"><SectionKicker>About this place</SectionKicker><h2>{property.title}</h2><p>{property.description}</p></div><div className="detail-section"><SectionKicker>Features</SectionKicker><div className="amenities">{property.amenities.map((amenity) => <span className="amenity" key={amenity}><Check size={13} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--blue)' }} />{amenity}</span>)}</div></div></div><aside className="detail-panel"><div className="eyebrow">Published listing · ownership not independently certified</div><h1>{property.title}</h1><div className="muted">{property.location}</div><div className="detail-price">{formatPrice(property.price, property.purpose, property.pricePeriod)}</div><div className="detail-specs"><div className="detail-spec"><strong>{property.bedrooms}</strong>bedrooms</div><div className="detail-spec"><strong>{property.bathrooms}</strong>bathrooms</div><div className="detail-spec"><strong>{property.area.toLocaleString('en-IN')}</strong>{property.areaUnit}</div></div><div style={{ display: 'flex', gap: 10, marginBottom: 28 }}><FavoriteButton propertyId={property.id} initial={property.favorite ?? false} /><button className="btn btn-outline" onClick={() => navigator.share ? navigator.share({ title: property.title, url: window.location.href }) : navigator.clipboard.writeText(window.location.href)}><Share2 size={15} /> Share</button></div><div className="form-card"><h2>Ask about this place</h2><p className="muted" style={{ fontSize: 13 }}>Your inquiry is sent to the listing owner's registered email. Check the confirmation message for delivery status.</p><form onSubmit={send}><div className="form-field"><label htmlFor="email">Email</label><input className="form-control" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" /></div><div className="form-field"><label htmlFor="message">Message</label><textarea className="form-control" id="message" value={message} onChange={(e) => setMessage(e.target.value)} required placeholder="I would like to understand more about this place..." /></div>{notice && <div className="status-message">{notice}</div>}<button className="btn btn-primary" disabled={sending} type="submit">{sending ? 'Sending...' : 'Send inquiry'}</button></form></div><ReportProperty propertyId={property.id} slug={property.slug} /></aside></div></div>{lightbox && <Lightbox src={lightbox} alt={property.title} onClose={() => setLightbox(null)} />}</main> }
