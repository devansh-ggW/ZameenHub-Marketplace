export type ListingPurpose = 'sale' | 'rent'
export type PropertyType = 'Apartment' | 'Villa' | 'House' | 'Plot' | 'Studio'
export type ListingStatus = 'published' | 'pending' | 'rejected' | 'draft' | 'archived'

export type Property = {
  id: string
  slug: string
  title: string
  location: string
  city: string
  purpose: ListingPurpose
  propertyType: PropertyType
  price: number
  pricePeriod?: 'month'
  bedrooms: number
  bathrooms: number
  area: number
  areaUnit: 'sq ft'
  image: string
  gallery: string[]
  description: string
  amenities: string[]
  featured?: boolean
  favorite?: boolean
  verified?: boolean
  verificationStatus?: 'unverified' | 'submitted' | 'in_review' | 'verified' | 'rejected'
  verificationEvidenceType?: string
  verificationEvidenceUrl?: string
  verificationSubmittedAt?: string
  verificationReviewedAt?: string
  verificationNote?: string
  videoUrl?: string
  status: ListingStatus
  ownerName: string
  ownerProfileImageUrl?: string
  ownerRole: string
  aiRiskLevel?: 'low' | 'medium' | 'high' | 'unscored' | 'not-screened'
  aiRiskScore?: number
  aiRiskReasons?: string[]
  aiScreenedAt?: string
  aiModel?: string
  reviewMessage?: string
}

// These are editorial architectural images for brand composition only.
// They are never attached to, or presented as, marketplace property records.
export const images = {
  hero: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1800&q=85',
  secondary: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80',
  detail: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1600&q=85',
  lounge: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
  exterior: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80',
  terrace: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1200&q=80',
  city: 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=80'
}

export const categories = [
  { label: 'Apartments', icon: '▦' },
  { label: 'Houses', icon: '⌂' },
  { label: 'Plots', icon: '◫' },
  { label: 'Rentals', icon: '↗' }
]

export function formatPrice(value: number, purpose: ListingPurpose, period?: string) {
  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
  return period ? `${formatted} / ${period}` : formatted
}
