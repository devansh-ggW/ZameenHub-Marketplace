export const PROPERTY_AMENITIES = [
  'Parking',
  'Lift',
  'Power backup',
  'Security',
  'Balcony',
  'Garden',
  'Gym',
  'Swimming pool',
  'Clubhouse',
  'Furnished',
  'Pet-friendly',
] as const

export type PropertyAmenity = typeof PROPERTY_AMENITIES[number]
