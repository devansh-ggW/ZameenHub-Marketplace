import assert from 'node:assert/strict'
import { calculateCommunityTrustIndicator as calculate } from '../worker/community-trust.ts'

const base = {
  requiredDocumentCount: 1,
  eligibleReportCount: 0,
  eligibleReviewCount: 3,
  distinctReviewers: 3,
  averageRating: 4.5,
  positiveReviewCount: 3,
  publicCommentCount: 2,
  publicReplyCount: 1,
}
const color = (overrides = {}) => calculate({ ...base, ...overrides }, '2026-11-11T12:00:00.000Z').color

assert.equal(color({ requiredDocumentCount: 0 }), 'RED', 'No ownership/legal evidence is RED even with positive activity')
assert.equal(color({ requiredDocumentCount: 0, eligibleReportCount: 5 }), 'RED', 'Missing evidence is evaluated first')
assert.equal(color({ eligibleReportCount: 2 }), 'GREEN', 'Two eligible reports do not block a qualifying GREEN')
assert.equal(color({ eligibleReportCount: 3 }), 'YELLOW', 'Three eligible reports force YELLOW')
assert.equal(color({ eligibleReportCount: 4 }), 'YELLOW', 'Four eligible reports force YELLOW')
assert.equal(color({ eligibleReportCount: 5 }), 'RED', 'Five eligible reports force RED')
assert.equal(color({ eligibleReportCount: 8 }), 'RED', 'Eight eligible reports force RED')
assert.equal(color({ eligibleReviewCount: 0, distinctReviewers: 0, averageRating: 0, positiveReviewCount: 0, publicCommentCount: 0, publicReplyCount: 0 }), 'YELLOW', 'Evidence alone is YELLOW')
assert.equal(color({ eligibleReviewCount: 2, distinctReviewers: 2 }), 'YELLOW', 'Two reviews are insufficient')
assert.equal(color({ eligibleReviewCount: 3, distinctReviewers: 2 }), 'YELLOW', 'Three reviews from only two accounts are insufficient')
assert.equal(color({ averageRating: 3.99 }), 'YELLOW', 'Average below 4 is insufficient')
assert.equal(color({ positiveReviewCount: 2 }), 'YELLOW', 'Below 70% positive is insufficient')
assert.equal(color({ positiveReviewCount: 2, eligibleReviewCount: 4 }), 'YELLOW', '50% positive is insufficient')
assert.equal(color({ publicCommentCount: 0 }), 'YELLOW', 'A review-only listing is insufficient')
assert.equal(color({ publicReplyCount: 0 }), 'YELLOW', 'A discussion without replies is insufficient')
assert.equal(color(), 'GREEN', 'All GREEN criteria satisfied')
assert.equal(calculate(base).reason, 'positive_community_activity')
assert.equal(calculate(base, '2026-11-11T12:00:00.000Z').calculatedAt, '2026-11-11T12:00:00.000Z')
console.log('Community Trust Indicator policy tests passed.')
