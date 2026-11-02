import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, CalendarDays, Home } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState, PropertyCard, SectionKicker } from './components'
import type { Property } from './lib/data'
import { apiRequest } from './lib/auth'

type PublicListerProfile = {
  id: string
  name: string
  profileImageUrl: string
  isAdmin: boolean
  memberSince: string
  publicListingCount: number
}

type PublicListerResponse = {
  profile: PublicListerProfile
  listings: Property[]
}

function memberSinceLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Member date unavailable'
    : 'Member since ' + date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function PublicListerProfilePage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<PublicListerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    setData(null)
    void apiRequest<PublicListerResponse>('/api/public-profiles/' + encodeURIComponent(id)).then(result => {
      if (!active) return
      if (result.ok) setData(result.data)
      else setError(result.error)
      setLoading(false)
    })
    return () => { active = false }
  }, [id])

  if (loading) return <main className="page-shell public-profile-page"><div className="container"><LoadingState /></div></main>
  if (error || !data) return <main className="page-shell public-profile-page"><div className="container">
    <div className="page-title"><SectionKicker>Public lister profile</SectionKicker><h1>Profile unavailable.</h1><p>{error || 'This public profile could not be found.'}</p><Link className="btn btn-outline" to="/properties"><ArrowLeft size={15} /> Back to properties</Link></div>
  </div></main>

  const { profile, listings } = data
  return <main className="page-shell public-profile-page"><div className="container">
    <div className="page-title"><SectionKicker>Public lister profile</SectionKicker><h1>Meet the<br /><span className="serif">property lister.</span></h1><p>A public view of this lister and the complete properties they currently have published on ZameenHub.</p></div>
    <section className="public-profile-card" aria-label="Lister details">
      <div className="public-profile-avatar">
        {profile.profileImageUrl
          ? <img src={profile.profileImageUrl} alt={profile.name + ' profile'} onError={event => { event.currentTarget.style.display = 'none' }} />
          : <span aria-hidden="true">{(profile.name || 'L').slice(0, 1).toUpperCase()}</span>}
      </div>
      <div className="public-profile-copy">
        <h2>{profile.name || 'Property lister'} {profile.isAdmin && <span className="admin-role-badge">ZameenHub Admin</span>}</h2>
        <p>This profile shows public listing information only. Private email and account details are not displayed.</p>
        <div className="public-profile-meta">
          <span><CalendarDays size={15} aria-hidden="true" />{memberSinceLabel(profile.memberSince)}</span>
          <span><Home size={15} aria-hidden="true" />{profile.publicListingCount} published {profile.publicListingCount === 1 ? 'listing' : 'listings'}</span>
        </div>
      </div>
    </section>
    <div className="public-profile-listings-head">
      <div><SectionKicker>Property portfolio</SectionKicker><h2>Public listings</h2></div>
      <Link className="btn btn-outline" to="/properties">Browse all properties <ArrowUpRight size={15} /></Link>
    </div>
    {listings.length
      ? <div className="property-grid">{listings.map(property => <PropertyCard key={property.id} property={property} />)}</div>
      : <EmptyState title="No public listings right now." copy="This lister currently has no complete published properties." />}
    {profile.publicListingCount > listings.length && <p className="muted" style={{ marginTop: 18, fontSize: 12 }}>Showing the newest {listings.length} of {profile.publicListingCount} published listings.</p>}
  </div></main>
}
