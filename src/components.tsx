import { useEffect, useRef, useState, type FormEvent, type ReactNode, type MouseEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Heart, Menu, Search, Share2, X } from 'lucide-react'
import { categories, formatPrice, images, type Property } from './lib/data'
import { apiRequest } from './lib/auth'
import { imageKitVariant } from './lib/media'
export { DepthImage, ScrollScene } from './motion'

export function ImageWithFallback({ src, alt, className, onClick }: { src: string; alt: string; className?: string; onClick?: () => void }) {
  const [failed, setFailed] = useState(false)
  return !src || failed ? <div className={`image-fallback ${className ?? ''}`} role="img" aria-label={alt}><span>Image unavailable</span></div> : <img src={imageKitVariant(src, className?.includes('gallery') ? 1280 : 720)} alt={alt} className={className} loading="lazy" decoding="async" onClick={onClick} onError={() => setFailed(true)} />
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return <header className="site-header"><div className="container nav">
    <Link to="/" className="brand" aria-label="ZameenHub home"><img src="/assets/zameenhub-icon.jpg" alt="" /><span>ZameenHub</span></Link>
    <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary"><NavLink to="/properties">Browse properties</NavLink><NavLink to="/saved">Saved</NavLink><NavLink to="/about">About</NavLink></nav>
    <div className="nav-actions"><Link className="btn btn-outline" to="/login">Sign in</Link><Link className="btn btn-primary" to="/list-property">List a property <ArrowUpRight size={15} /></Link><button className="icon-btn mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X size={18} /> : <Menu size={18} />}</button></div>
  </div></header>
}

export function SiteFooter() { return <footer className="footer"><div className="container footer-grid"><div><Link to="/" className="brand"><img src="/assets/zameenhub-icon.jpg" alt="" /><span>ZameenHub</span></Link><p style={{ maxWidth: 280, marginTop: 22 }}>A property marketplace where sellers can share their original evidence and buyers can inspect it themselves.</p></div><div><h4>Explore</h4><Link to="/properties">Browse properties</Link><br /><Link to="/saved">Saved properties</Link><br /><Link to="/list-property">List a property</Link></div><div><h4>Company</h4><Link to="/about">About</Link><br /><Link to="/contact">Contact</Link><br /><Link to="/help">Help centre</Link></div><div><h4>Legal</h4><Link to="/privacy">Privacy</Link><br /><Link to="/terms">Terms</Link></div></div><div className="container footer-bottom"><span>© 2026 ZameenHub</span><span>Inspect seller evidence before you decide</span></div></footer> }

export function PropertyCard({ property }: { property: Property }) {
  const isPublished = property.status === 'published'
  const details = <><span className="property-location">{property.location}</span><h3>{property.title}</h3><div className="property-price">{formatPrice(property.price, property.purpose, property.pricePeriod)}</div></>
  return <article className="property-card">
    <div className="property-image">
      {isPublished
        ? <Link to={`/properties/${property.slug}`} className="property-image-link" aria-label={`View property: ${property.title}`}><ImageWithFallback src={property.image} alt={`${property.title}, ${property.location}`} /></Link>
        : <div className="property-image-link"><ImageWithFallback src={property.image} alt={`${property.title}, ${property.location}`} /></div>}
      <span className="property-badge">{property.purpose === 'sale' ? 'For sale' : 'For rent'}</span>
      <span className={'property-verification-badge ' + (property.verified ? 'verified' : 'unverified')} title={property.verified ? 'Manually verified by a ZameenHub administrator' : 'Not yet manually verified by ZameenHub'}>{property.verified ? 'Verified' : 'Unverified'}</span>
      {isPublished && <FavoriteButton propertyId={property.id} initial={property.favorite ?? false} />}
    </div>
    <div className="property-content">
      {isPublished ? <Link to={`/properties/${property.slug}`} className="property-content-link">{details}</Link> : <div className="property-content-link">{details}</div>}
      <div className="property-meta"><span>{property.bedrooms} bed</span><span>{property.bathrooms} bath</span><span>{property.area.toLocaleString('en-IN')} {property.areaUnit}</span></div>
    </div>
  </article>
}

export function FavoriteButton({ initial = false, propertyId, checkSaved = false }: { initial?: boolean; propertyId?: string; checkSaved?: boolean }) { const [active,setActive]=useState(initial); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const navigate=useNavigate(); const location=useLocation(); useEffect(()=>{let current=true;setActive(initial);if(checkSaved&&propertyId)void apiRequest<{saved:boolean}>('/api/favorites/'+encodeURIComponent(propertyId)).then(r=>{if(!current)return;if(r.ok)setActive(r.data.saved);else if(r.status!==401)setError(r.error)});return()=>{current=false}},[propertyId,initial,checkSaved]); const toggle=async(event:MouseEvent<HTMLButtonElement>)=>{event.preventDefault();event.stopPropagation();if(busy)return;if(!propertyId){setError('This property cannot be saved yet.');return}setBusy(true);setError('');const r=await apiRequest<{saved:boolean}>('/api/favorites/'+encodeURIComponent(propertyId),{method:active?'DELETE':'POST',...(active?{}:{body:JSON.stringify({})})});setBusy(false);if(!r.ok){if(r.status===401)navigate('/login?next='+encodeURIComponent(location.pathname+location.search));else setError(r.error);return}setActive(r.data.saved)};return <button type="button" className={`favorite ${active?'active':''}`} aria-label={error||(active?'Remove from saved':'Save property')} title={error} disabled={busy} onClick={e=>void toggle(e)}>{active?<Heart size={16} fill="currentColor"/>:<Heart size={16}/>}</button> }

export function PropertySearch({ compact = false }: { compact?: boolean }) { const navigate=useNavigate();const [q,setQ]=useState('');const [purpose,setPurpose]=useState('');const [type,setType]=useState('');const submit=(event:FormEvent)=>{event.preventDefault();const params=new URLSearchParams();if(q)params.set('q',q);if(purpose)params.set('purpose',purpose);if(type)params.set('type',type);navigate(`/properties?${params.toString()}`)};return <form className={`search-panel ${compact?'compact':''}`} onSubmit={submit}><div className="search-field"><label htmlFor="search-location">Location or keyword</label><input id="search-location" value={q} onChange={e=>setQ(e.target.value)} placeholder="Try Mumbai or a neighbourhood"/></div><div className="search-field"><label htmlFor="search-purpose">I want to</label><select id="search-purpose" value={purpose} onChange={e=>setPurpose(e.target.value)}><option value="">Buy or rent</option><option value="sale">Buy</option><option value="rent">Rent</option></select></div><div className="search-field"><label htmlFor="search-type">Property type</label><select id="search-type" value={type} onChange={e=>setType(e.target.value)}><option value="">Any type</option><option>Apartment</option><option>House</option><option>Villa</option><option>Studio</option><option>Plot</option></select></div><button className="search-submit" type="submit"><Search size={16}/> Search</button></form> }

export function CinematicScrollExperience() { const ref = useRef<HTMLElement>(null); const [progress, setProgress] = useState(0); useEffect(() => { let frame = 0; const onScroll = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!ref.current) return; const rect = ref.current.getBoundingClientRect(); const range = Math.max(ref.current.offsetHeight - window.innerHeight, 1); setProgress(Math.min(1, Math.max(0, -rect.top / range))) }) }; window.addEventListener('scroll', onScroll, { passive: true }); onScroll(); return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll) } }, []); const scene = progress < .34 ? { eyebrow: '01 / Arrive', title: 'Start with the feeling.', copy: 'Search by place, pace, and possibility.' } : progress < .68 ? { eyebrow: '02 / Look closer', title: 'Compare what matters.', copy: 'Move through neighbourhoods and details with a little more context.' } : { eyebrow: '03 / Settle in', title: 'Find your place.', copy: 'A considered search ends with a place that feels like yours.' }; return <section className="parallax-wrap" ref={ref} aria-label="ZameenHub cinematic discovery story"><div className="parallax-sticky"><ImageWithFallback src={images.city} alt="Modern city architecture" className="parallax-bg" /><ImageWithFallback src={images.detail} alt="Bright contemporary living room" className="parallax-main" /><ImageWithFallback src={images.terrace} alt="Apartment terrace detail" className="parallax-detail" /><div className="parallax-step mono">SCROLL / {Math.round(progress * 100).toString().padStart(2, '0')}%</div><div className="parallax-copy"><div className="eyebrow">{scene.eyebrow}</div><h2>{scene.title}</h2><p>{scene.copy}</p></div></div><style>{`.parallax-bg{transform:translate3d(0,${progress * -8}%,0) scale(${1.06 + progress * .08})}.parallax-main{transform:translate3d(${progress * -16}%,${progress * 9}%,0) scale(${1 + progress * .12}) rotate(${progress * -2}deg)}.parallax-detail{transform:translate3d(${progress * 28}%,${progress * -28}%,0) rotate(${progress * 6}deg)}.parallax-copy{transform:translate3d(0,${Math.sin(progress * Math.PI) * -20}px,0);opacity:${.86 + Math.sin(progress * Math.PI) * .14}}`}</style></section> }

export function SectionKicker({ children }: { children: ReactNode }) { return <span className="eyebrow">{children}</span> }
export function LoadingState() { return <div className="empty-state"><div className="eyebrow">Loading</div><h2>Finding the right places.</h2><p className="muted">Pulling together the latest available results.</p></div> }
export function EmptyState({ title = 'Nothing here yet.', copy = 'When verified marketplace data is connected, it will appear here.' }: { title?: string; copy?: string }) { return <div className="empty-state"><div className="eyebrow">No live data</div><h2>{title}</h2><p className="muted">{copy}</p><Link to="/properties" className="btn btn-outline" style={{ marginTop: 16 }}>Browse all properties</Link></div> }
export function ErrorState({ message }: { message: string }) { return <div className="status-message error">{message}</div> }
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) { return <div className="lightbox" role="dialog" aria-modal="true" aria-label="Property image"><button className="icon-btn close" onClick={onClose} aria-label="Close image"><X size={20} /></button><img src={src} alt={alt} /></div> }
