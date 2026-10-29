import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Info, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, ImageWithFallback, LoadingState, SectionKicker } from './components'
import { getProperties } from './lib/api'
import { formatPrice, type Property } from './lib/data'

type Opportunity = {
  property: Property
  peerCount: number
  benchmarkRate: number
  listingRate: number
  gapPercent: number
  gapAmount: number
}

const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function comparisonCity(property: Property) {
  return normalize(property.city || property.location)
}

function comparableListings(subject: Property, all: Property[]) {
  if (subject.area <= 0 || subject.price <= 0) return []
  return all.filter(peer => {
    if (peer.id === subject.id || peer.status !== 'published') return false
    if (peer.purpose !== subject.purpose || peer.propertyType !== subject.propertyType) return false
    if (comparisonCity(peer) !== comparisonCity(subject)) return false
    if (peer.area <= 0 || peer.price <= 0) return false
    const areaRatio = peer.area / subject.area
    if (areaRatio < 0.65 || areaRatio > 1.35) return false
    if (subject.bedrooms > 0 && peer.bedrooms > 0 && Math.abs(peer.bedrooms - subject.bedrooms) > 1) return false
    return true
  })
}

export function OpportunityFinderPage() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [purpose, setPurpose] = useState<'sale' | 'rent'>('sale')
  const [propertyType, setPropertyType] = useState('')
  const [location, setLocation] = useState('')

  useEffect(() => {
    let active = true
    void getProperties(new URLSearchParams()).then(result => {
      if (!active) return
      if (result.ok) {
        setProperties(result.data.filter(property => property.status === 'published'))
        setError('')
      } else {
        setError(result.error)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const opportunities = useMemo(() => {
    const locationTerm = normalize(location)
    return properties
      .filter(property => property.purpose === purpose)
      .filter(property => !propertyType || property.propertyType === propertyType)
      .filter(property => !locationTerm || normalize(property.city + ' ' + property.location).includes(locationTerm))
      .map((property): Opportunity | null => {
        const peers = comparableListings(property, properties)
        if (peers.length < 3) return null
        const rates = peers.map(peer => peer.price / peer.area).filter(rate => Number.isFinite(rate) && rate > 0)
        if (rates.length < 3) return null
        const benchmarkRate = median(rates)
        const listingRate = property.price / property.area
        const gapPercent = ((benchmarkRate - listingRate) / benchmarkRate) * 100
        if (!Number.isFinite(gapPercent) || gapPercent < 5) return null
        return {
          property,
          peerCount: peers.length,
          benchmarkRate,
          listingRate,
          gapPercent,
          gapAmount: Math.max(0, benchmarkRate * property.area - property.price)
        }
      })
      .filter((item): item is Opportunity => item !== null)
      .sort((a, b) => b.gapPercent - a.gapPercent)
  }, [properties, purpose, propertyType, location])

  return <main className="page-shell intelligence-page">
    <div className="container">
      <div className="page-title">
        <SectionKicker>Property intelligence</SectionKicker>
        <h1>Find the <span className="serif">price gap.</span></h1>
        <p>Surface published properties whose asking price per sq. ft. is meaningfully below similar listings in the same city. Every comparison uses live ZameenHub listing records available to the site.</p>
      </div>

      <div className="tool-disclaimer">
        <Info size={18} />
        <p><strong>Potential opportunity, not a guaranteed bargain.</strong> These are comparisons of advertised prices—not verified transaction prices, formal valuations, or promises of future savings. Results need at least three comparable published listings.</p>
      </div>

      <form className="filters-bar opportunity-filters" onSubmit={event => event.preventDefault()}>
        <div className="filter-item">
          <label htmlFor="opportunity-purpose">Looking to</label>
          <select id="opportunity-purpose" value={purpose} onChange={event => setPurpose(event.target.value as 'sale' | 'rent')}>
            <option value="sale">Buy</option>
            <option value="rent">Rent</option>
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="opportunity-type">Property type</label>
          <select id="opportunity-type" value={propertyType} onChange={event => setPropertyType(event.target.value)}>
            <option value="">All types</option>
            <option>Apartment</option>
            <option>House</option>
            <option>Villa</option>
            <option>Studio</option>
            <option>Plot</option>
          </select>
        </div>
        <div className="filter-item">
          <label htmlFor="opportunity-location">City or locality</label>
          <input id="opportunity-location" value={location} onChange={event => setLocation(event.target.value)} maxLength={100} placeholder="e.g. Pune, Baner" />
        </div>
        <button className="btn btn-outline" type="button" onClick={() => { setPurpose('sale'); setPropertyType(''); setLocation('') }}>Reset filters</button>
      </form>

      <div className="results-head">
        <span className="mono">{loading ? 'Comparing listings…' : error ? 'Comparison unavailable' : opportunities.length + ' potential price gaps'}</span>
        <span className="muted" style={{ fontSize: 12 }}>Ranked by difference from median asking price per sq. ft.</span>
      </div>

      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : opportunities.length ? <div className="opportunity-grid">
        {opportunities.map(item => <article className="opportunity-card" key={item.property.id}>
          <Link to={'/properties/' + item.property.slug} className="opportunity-image-link" aria-label={'Inspect ' + item.property.title}>
            <ImageWithFallback src={item.property.image} alt={item.property.title + ', ' + item.property.location} />
            <span className="opportunity-signal"><TrendingDown size={15} /> {item.gapPercent.toFixed(1)}% below comparison</span>
          </Link>
          <div className="opportunity-card-body">
            <span className="opportunity-location">{item.property.location}</span>
            <h2><Link to={'/properties/' + item.property.slug}>{item.property.title}</Link></h2>
            <div className="opportunity-price">{formatPrice(item.property.price, item.property.purpose, item.property.pricePeriod)}</div>
            <div className="opportunity-stats">
              <div><span>Listing rate</span><strong>{rupees.format(item.listingRate)}<small> / sq. ft.</small></strong></div>
              <div><span>Comparable median</span><strong>{rupees.format(item.benchmarkRate)}<small> / sq. ft.</small></strong></div>
              <div><span>Asking-price gap*</span><strong>{rupees.format(item.gapAmount)}{purpose === 'rent' ? <small> / month</small> : null}</strong></div>
            </div>
            <p className="opportunity-evidence">Compared with {item.peerCount} published {item.property.propertyType.toLocaleLowerCase()} listings of a similar size in {item.property.city || 'the same locality'}. Comparison sample: {item.peerCount >= 6 ? 'broader' : 'limited'}.</p>
            <Link className="btn btn-outline opportunity-open" to={'/properties/' + item.property.slug}>Inspect listing <ArrowUpRight size={15} /></Link>
          </div>
        </article>)}
      </div> : <div className="empty-state">
        <div className="eyebrow">No supported matches</div>
        <h2>{properties.length ? 'No qualifying price gaps found.' : 'No published listings to compare yet.'}</h2>
        <p className="muted">{properties.length ? 'Try another city or property type. A listing only appears here when at least three similar published listings are available and its asking price per sq. ft. is at least 5% below their median.' : 'Opportunity Finder only uses actual published listings. It will not invent properties or estimates to fill this space.'}</p>
        <Link to="/properties" className="btn btn-outline" style={{ marginTop: 16 }}>Browse published properties <ArrowUpRight size={15} /></Link>
      </div>}

      <p className="tool-footnote">*Asking-price gap is the subject listing's price compared with the median asking rate multiplied by its area. It is not a claim that the seller will accept that amount less. Listings can differ in condition, exact micro-location, title, amenities and other factors not captured here.</p>
    </div>
  </main>
}
