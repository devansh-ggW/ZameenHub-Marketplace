import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { CinematicScrollExperience, EmptyState, ErrorState, FavoriteButton, ImageWithFallback, Lightbox, LoadingState, PropertyCard, PropertySearch, SectionKicker, ScrollScene } from './components'
import { categories, formatPrice, images, type ListingHistoryEvent, type Property } from './lib/data'
import { getProperties, getProperty, submitInquiry } from './lib/api'
import { apiRequest, getSession } from './lib/auth'
import { ReportProperty } from './report-property'
import { PROPERTY_AMENITIES } from './lib/property-options'

function formatHistoryDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function historyEventTitle(event: ListingHistoryEvent) {
  switch (event.eventType) {
    case 'tracking_started': return 'History tracking started'
    case 'listing_created': return 'Listing created'
    case 'price_increased': return 'Asking price increased'
    case 'price_decreased': return 'Asking price reduced'
    case 'description_changed': return 'Property description updated'
    case 'property_details_changed': return 'Property details updated'
    case 'images_added': return 'Property photos added'
    case 'images_removed': return 'Property photos removed'
    case 'document_added': return 'Seller document added'
    case 'document_removed': return 'Seller document removed'
    case 'document_replaced': return 'Document source link replaced'
    case 'document_updated': return 'Document details updated'
    case 'listing_published': return 'Listing published'
    case 'listing_unpublished': return 'Listing unpublished'
    default: return 'Listing updated'
  }
}

function historyEventDetail(event: ListingHistoryEvent) {
  if (event.eventType === 'tracking_started') return 'Listing history begins from the date tracking became available. Earlier changes are not available.'
  if (event.eventType === 'price_increased' || event.eventType === 'price_decreased') {
    const format = (value: string | null) => value === null ? 'Not recorded' : '₹' + Number(value).toLocaleString('en-IN')
    return 'Previous price: ' + format(event.previousValue) + ' · New price: ' + format(event.newValue)
  }
  if (event.eventType === 'images_added' || event.eventType === 'images_removed') {
    const count = Number(event.metadata.count || 1)
    return (Number.isFinite(count) ? count : 1) + ' photo' + (count === 1 ? '' : 's') + (event.eventType === 'images_added' ? ' added' : ' removed')
  }
  if (event.eventType.startsWith('document_')) {
    const description = typeof event.metadata.description === 'string' ? event.metadata.description : 'A seller-provided document'
    const domain = typeof event.metadata.sourceDomain === 'string' ? event.metadata.sourceDomain : ''
    return description + (domain ? ' · Source: ' + domain : '')
  }
  if (event.eventType === 'listing_unpublished') return event.metadata.reason === 'owner_archived' ? 'The owner archived this listing.' : 'The listing was removed from public discovery.'
  if (event.eventType === 'description_changed') return 'The seller changed the property description.'
  if (event.eventType === 'property_details_changed') return 'Important property information such as area, location or room details changed.'
  if (event.eventType === 'listing_created') return 'The seller created this listing.'
  if (event.eventType === 'listing_published') return 'The listing became publicly available.'
  return ''
}

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
      <div className="section-head"><div><SectionKicker>Property discovery</SectionKicker><h2>Search what is<br /><span className="serif">actually available.</span></h2></div><p>Recently published properties come directly from ZameenHub’s property service. Only published listings with at least one property photo and one seller-provided document appear here. If there are none, we say so instead of inventing inventory.</p></div>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : recent.length > 0 ? <div className="property-grid">{recent.map(property => <PropertyCard property={property} key={property.id} />)}</div> : <EmptyState title="No published properties yet." copy="There are no public listings right now. Owners can submit property details, which are checked before publication." />}
      <div className="home-discovery-actions" style={{ marginTop: 30 }}><Link to="/properties" className="btn btn-primary">Open property search <ArrowUpRight size={16} /></Link><Link to="/tools/emi-calculator" className="btn btn-outline">Calculate a home-loan EMI <ArrowUpRight size={16} /></Link></div>
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
  const [maxArea, setMaxArea] = useState(searchParams.get('maxArea') ?? '')
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(() => (searchParams.get('amenities') ?? '').split(',').filter(value => (PROPERTY_AMENITIES as readonly string[]).includes(value)))

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
    if (maxArea) next.set('maxArea', maxArea)
    if (selectedAmenities.length) next.set('amenities', selectedAmenities.join(','))
    if (sort !== 'newest') next.set('sort', sort)
    setSearchParams(next)
  }

  function clearAll() {
    setQ(''); setPurpose(''); setType(''); setBeds(''); setBaths('')
    setMinPrice(''); setMaxPrice(''); setMinArea(''); setMaxArea(''); setSort('newest'); setSelectedAmenities([])
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
    setMaxArea(searchParams.get('maxArea') ?? '')
    setSelectedAmenities((searchParams.get('amenities') ?? '').split(',').filter(value => (PROPERTY_AMENITIES as readonly string[]).includes(value)))
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
      <div className="filter-item"><label htmlFor="max-area">Maximum area (sq ft)</label><input id="max-area" type="number" min="0" max="100000000" step="1" value={maxArea} onChange={e => setMaxArea(e.target.value)} placeholder="No maximum" /></div>
      <div className="filter-item"><label htmlFor="sort">Sort</label><select id="sort" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></div>
      <details className="filter-amenities"><summary>Amenities{selectedAmenities.length ? ` · ${selectedAmenities.length} selected` : ''}</summary><div className="amenity-options">{PROPERTY_AMENITIES.map(amenity => <label className="amenity-option" key={amenity}><input type="checkbox" checked={selectedAmenities.includes(amenity)} onChange={event => setSelectedAmenities(current => event.target.checked ? [...current, amenity] : current.filter(item => item !== amenity))} /> <span>{amenity}</span></label>)}</div></details>
      <button className="btn btn-primary" type="submit">Apply filters</button>
      <button className="btn" type="button" onClick={clearAll}>Clear all</button>
    </form>
    <div className="results-head"><span className="mono">{loading ? 'Searching...' : `${items.length} properties`}</span><span className="muted" style={{ fontSize: 12 }}>Published listings only</span></div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : items.length ? <div className="property-grid">{items.map(property => <PropertyCard property={property} key={property.id} />)}</div> : <>
      <EmptyState title="No properties match those filters." copy="Try a broader location, adjust your budget, or clear a filter. New submissions remain private while pending review." />
      <div className="listing-visibility-help"><p><strong>Recently submitted a property?</strong> It may be saved privately in your account. Listings appear here only after a property photo and a seller-provided document have been saved.</p><Link to="/my-listings" className="btn btn-outline">Check my listings <ArrowUpRight size={15} /></Link></div>
    </>}
  </div></main>
}

export function PropertyDetailPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [property, setProperty] = useState<Property | null>(null)
  const [error, setError] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [viewerAuthenticated, setViewerAuthenticated] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [chatStarting, setChatStarting] = useState(false)
  const [chatError, setChatError] = useState('')
  const [history, setHistory] = useState<ListingHistoryEvent[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    let active = true
    void getProperty(slug).then(result => {
      if (!active) return
      if (result.ok) setProperty(result.data)
      else setError(result.error)
    })
    void apiRequest<ListingHistoryEvent[]>('/api/properties/' + encodeURIComponent(slug) + '/history').then(result => {
      if (!active) return
      if (result.ok) setHistory(result.data)
      else setHistoryError(result.error)
      setHistoryLoading(false)
    }).catch(() => {
      if (!active) return
      setHistoryError('Listing history could not be loaded right now.')
      setHistoryLoading(false)
    })
    void getSession().then(result => {
      if (active && result.ok) setViewerAuthenticated(result.data.authenticated)
    }).catch(() => { /* Public property details remain available during an auth-service interruption. */ })
    return () => { active = false }
  }, [slug])

  if (error) return <main className="page-shell"><div className="container"><EmptyState title="This property is unavailable." copy={error} /></div></main>
  if (!property) return <main className="page-shell"><div className="container"><LoadingState /></div></main>

  const sendInquiry = async (event: FormEvent) => {
    event.preventDefault(); setSending(true); setNotice('')
    const result = await submitInquiry({ propertyId: property.id, message, email })
    setSending(false)
    if (result.ok) {
      setNotice((result.data.notificationSent ? 'Your inquiry was sent to the listing owner. ' : 'Your inquiry was saved, but an email notification could not be delivered. ') + 'Reference: ' + result.data.reference)
      setEmail(''); setMessage('')
    } else setNotice(result.error)
  }
  const startChat = async (event: FormEvent) => {
    event.preventDefault()
    if (!viewerAuthenticated) {
      navigate('/login?next=' + encodeURIComponent('/properties/' + property.slug))
      return
    }
    const firstMessage = chatDraft.trim()
    if (!firstMessage) { setChatError('Write a message first.'); return }
    setChatStarting(true); setChatError('')
    const result = await apiRequest<{ id: string }>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ propertyId: property.id, message: firstMessage }),
    })
    setChatStarting(false)
    if (!result.ok) { setChatError(result.error); return }
    navigate('/messages?conversation=' + encodeURIComponent(result.data.id))
  }

  return <main className="page-shell"><div className="container">
    <Link to="/properties" className="mono" style={{ color: 'var(--blue)' }}><ArrowLeft size={13} style={{ verticalAlign: 'middle' }} /> Back to properties</Link>
    <div className="detail-grid" style={{ marginTop: 28 }}>
      <div>
        {property.gallery.length ? <div className="gallery">{property.gallery.map((image, index) => <ImageWithFallback key={image} src={image} alt={`${property.title} view ${index + 1}`} className="gallery-image" onClick={() => setLightbox(image)} />)}</div> : <div className="gallery-empty">No property photos supplied by the owner.</div>}
        <section className="detail-section property-documents evidence-room" aria-labelledby="property-documents-title">
          <SectionKicker>Seller-provided evidence</SectionKicker>
          <h2 id="property-documents-title">Property Evidence Room</h2>
          <p className="muted">Don't rely on a badge or a description alone. Inspect the original seller-provided source yourself. ZameenHub stores the reference, not the file, and does not legally authenticate these documents or confirm ownership.</p>
          {property.documents?.length ? <div className="document-link-list">{property.documents.map(document => <article className="document-link-card" key={document.id}>
            <div className="evidence-preview">
              {document.documentType === 'image'
                ? <img className="evidence-image-preview" src={document.url} loading="lazy" referrerPolicy="no-referrer" alt={'Seller-provided image: ' + document.description} />
                : <div className="evidence-file-mark" aria-label="PDF document">PDF</div>}
            </div>
            <div className="evidence-document-copy">
              <strong>{document.description}</strong>
              <span className="evidence-seller-label">Seller-provided · Not independently authenticated</span>
              <p className="muted">Format: {document.documentType.toUpperCase()} · Original source: {document.sourceDomain}</p>
              <p className="muted">Added on {formatHistoryDate(document.createdAt)}{document.updatedAt && document.updatedAt !== document.createdAt ? ' · Updated on ' + formatHistoryDate(document.updatedAt) : ''}</p>
            </div>
            <a href={document.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label={`Open original source for ${document.description} on ${document.sourceDomain} in a new tab`}>Open original source ↗</a>
          </article>)}</div> : <p className="gallery-empty">No PDF or image documents have been supplied by the seller.</p>}
        </section>
        <section className="detail-section listing-history" aria-labelledby="listing-history-title">
          <SectionKicker>Transparent property record</SectionKicker>
          <h2 id="listing-history-title">Listing History</h2>
          <p className="muted">A chronological record of meaningful changes recorded by ZameenHub. This timeline does not invent changes from before tracking began.</p>
          {historyLoading ? <p className="status-message">Loading listing history…</p>
            : historyError ? <p className="status-message error" role="status">{historyError}</p>
            : history.length ? <ol className="listing-history-list">{history.map(event => <li className="listing-history-item" key={event.id}>
              <div className="listing-history-head"><strong>{historyEventTitle(event)}</strong><time dateTime={event.createdAt}>{formatHistoryDate(event.createdAt)}</time></div>
              {historyEventDetail(event) && <p>{historyEventDetail(event)}</p>}
            </li>)}</ol>
            : <p className="gallery-empty">No listing changes have been recorded yet.</p>}
        </section>
        <div className="detail-section"><SectionKicker>About this place</SectionKicker><h2>{property.title}</h2><p>{property.description}</p></div>
        <div className="detail-section"><SectionKicker>Features</SectionKicker><div className="amenities">{property.amenities.map(amenity => <span className="amenity" key={amenity}><Check size={13} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--blue)' }} />{amenity}</span>)}</div></div>
      </div>
      <aside className="detail-panel">
        <div className="eyebrow">Published listing</div>
        <p className={'verification-badge ' + (property.verified ? 'verified' : 'unverified')}>{property.verified ? 'Verified by ZameenHub' : 'Unverified · awaiting manual verification'}</p>
        <h1>{property.title}</h1>
        <div className="muted">{property.location}</div>
        <div className="detail-price">{formatPrice(property.price, property.purpose, property.pricePeriod)}</div>
        <div className="detail-specs"><div className="detail-spec"><strong>{property.bedrooms}</strong>bedrooms</div><div className="detail-spec"><strong>{property.bathrooms}</strong>bathrooms</div><div className="detail-spec"><strong>{property.area.toLocaleString('en-IN')}</strong>{property.areaUnit}</div></div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}><FavoriteButton propertyId={property.id} initial={property.favorite ?? false} /><button className="btn btn-outline" onClick={() => { if (navigator.share) void navigator.share({ title: property.title, url: window.location.href }).catch(() => {}); else void navigator.clipboard.writeText(window.location.href) }}><Share2 size={15} /> Share</button></div>
        <div className="owner-profile-card"><div className="owner-avatar">{property.ownerProfileImageUrl ? <img src={property.ownerProfileImageUrl} alt={property.ownerName + ' profile'} onError={event => { event.currentTarget.style.display = 'none' }} /> : <span>{(property.ownerName || 'Owner').slice(0, 1).toUpperCase()}</span>}</div><div><strong>{property.ownerName || 'Listing owner'}</strong><p className="muted">Contact through a private chat or the inquiry form below</p></div></div>
        <section className="form-card chat-start-card">
          <h2>Chat with the owner</h2>
          <p className="muted" style={{ fontSize: 13 }}>Ask questions and continue the conversation in your private ZameenHub inbox. Sign-in is required to reduce spam.</p>
          {!chatOpen ? <button className="btn btn-primary" type="button" style={{ width: '100%' }} onClick={() => {
            if (!viewerAuthenticated) {
              navigate('/login?next=' + encodeURIComponent('/properties/' + property.slug))
              return
            }
            setChatOpen(true)
            setChatError('')
          }}>{viewerAuthenticated ? 'Start private chat' : 'Sign in to chat'}</button> : <form onSubmit={startChat}>
            <div className="form-field"><label htmlFor="chat-first-message">Your message</label><textarea className="form-control" id="chat-first-message" required maxLength={2000} rows={3} value={chatDraft} onChange={event => setChatDraft(event.target.value)} placeholder="Hi, is this property available? Could I arrange a viewing?" /></div>
            {chatError && <p className="status-message error" role="alert">{chatError}</p>}
            <button className="btn btn-primary" style={{ width: '100%' }} disabled={chatStarting || !chatDraft.trim()}>{chatStarting ? 'Starting chat…' : 'Start conversation'}</button>
            {!viewerAuthenticated && <p className="muted" style={{ fontSize: 12 }}>After signing in, return here and send your opening message.</p>}
            <button className="btn btn-outline" type="button" onClick={() => { setChatOpen(false); setChatError('') }}>Cancel</button>
          </form>}
        </section>
        <div className="form-card"><h2>Ask about this place</h2><p className="muted" style={{ fontSize: 13 }}>You can also send an email inquiry to the listing owner. No account is needed for this form.</p><form onSubmit={sendInquiry}><div className="form-field"><label htmlFor="inquiry-email">Email</label><input className="form-control" id="inquiry-email" type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" /></div><div className="form-field"><label htmlFor="inquiry-message">Message</label><textarea className="form-control" id="inquiry-message" value={message} onChange={event => setMessage(event.target.value)} required minLength={12} maxLength={2000} placeholder="I would like to understand more about this place…" /></div>{notice && <div className="status-message" role="status">{notice}</div>}<button className="btn btn-primary" disabled={sending} type="submit">{sending ? 'Sending…' : 'Send email inquiry'}</button></form></div>
        <ReportProperty propertyId={property.id} slug={property.slug} />
      </aside>
    </div>
  </div>{lightbox && <Lightbox src={lightbox} alt={property.title} onClose={() => setLightbox(null)} />}</main>
}

export function NotFoundPage() {
  return <main className="page-shell"><div className="container">
    <div className="page-title">
      <SectionKicker>404 · Page not found</SectionKicker>
      <h1>This page doesn’t exist.</h1>
      <p>The address may be incorrect or the page may have moved. You can head home or browse the properties currently published on ZameenHub.</p>
      <div className="home-discovery-actions" style={{ marginTop: 24 }}>
        <Link to="/" className="btn btn-primary"><ArrowLeft size={16} /> Go home</Link>
        <Link to="/properties" className="btn btn-outline">Browse properties <ArrowUpRight size={16} /></Link>
      </div>
    </div>
  </div></main>
}
