export const COMMUNITY_TRUST_POLICY = Object.freeze({
  minimumEligibleReviews: 3,
  minimumDistinctReviewers: 3,
  minimumAverageRating: 4,
  minimumPositiveReviewShare: 0.70,
  minimumPublicComments: 1,
  minimumPublicReplies: 1,
  yellowReportThreshold: 3,
  redReportThreshold: 5,
})

export type CommunityTrustInputs = {
  requiredDocumentCount: number
  eligibleReportCount: number
  eligibleReviewCount: number
  distinctReviewers: number
  averageRating: number
  positiveReviewCount: number
  publicCommentCount: number
  publicReplyCount: number
}

export type CommunityTrustColor = 'RED' | 'YELLOW' | 'GREEN'
export type CommunityTrustReason =
  | 'no_ownership_evidence'
  | 'report_red_threshold'
  | 'report_yellow_threshold'
  | 'insufficient_reviews'
  | 'low_average_rating'
  | 'mixed_feedback'
  | 'insufficient_discussion'
  | 'positive_community_activity'

export type CommunityTrustResult = CommunityTrustInputs & {
  color: CommunityTrustColor
  reason: CommunityTrustReason
  positiveReviewShare: number
  policy: typeof COMMUNITY_TRUST_POLICY
  calculatedAt: string
}

/**
 * The sole authoritative colour calculation. This deliberately treats seller-
 * supplied records as submitted evidence, never as authenticated legal proof.
 */
export function calculateCommunityTrustIndicator(
  input: CommunityTrustInputs,
  calculatedAt = new Date().toISOString(),
): CommunityTrustResult {
  const stats: CommunityTrustInputs = {
    requiredDocumentCount: Math.max(0, Math.floor(Number(input.requiredDocumentCount) || 0)),
    eligibleReportCount: Math.max(0, Math.floor(Number(input.eligibleReportCount) || 0)),
    eligibleReviewCount: Math.max(0, Math.floor(Number(input.eligibleReviewCount) || 0)),
    distinctReviewers: Math.max(0, Math.floor(Number(input.distinctReviewers) || 0)),
    averageRating: Math.max(0, Number(input.averageRating) || 0),
    positiveReviewCount: Math.max(0, Math.floor(Number(input.positiveReviewCount) || 0)),
    publicCommentCount: Math.max(0, Math.floor(Number(input.publicCommentCount) || 0)),
    publicReplyCount: Math.max(0, Math.floor(Number(input.publicReplyCount) || 0)),
  }
  const positiveReviewShare = stats.eligibleReviewCount > 0
    ? Math.min(1, stats.positiveReviewCount / stats.eligibleReviewCount)
    : 0

  let color: CommunityTrustColor = 'YELLOW'
  let reason: CommunityTrustReason = 'insufficient_reviews'

  // Priority is part of the published policy: RED overrides all positive activity.
  if (stats.requiredDocumentCount < 1) {
    color = 'RED'
    reason = 'no_ownership_evidence'
  } else if (stats.eligibleReportCount >= COMMUNITY_TRUST_POLICY.redReportThreshold) {
    color = 'RED'
    reason = 'report_red_threshold'
  } else if (stats.eligibleReportCount >= COMMUNITY_TRUST_POLICY.yellowReportThreshold) {
    color = 'YELLOW'
    reason = 'report_yellow_threshold'
  } else if (
    stats.eligibleReviewCount < COMMUNITY_TRUST_POLICY.minimumEligibleReviews ||
    stats.distinctReviewers < COMMUNITY_TRUST_POLICY.minimumDistinctReviewers
  ) {
    color = 'YELLOW'
    reason = 'insufficient_reviews'
  } else if (stats.averageRating < COMMUNITY_TRUST_POLICY.minimumAverageRating) {
    color = 'YELLOW'
    reason = 'low_average_rating'
  } else if (positiveReviewShare < COMMUNITY_TRUST_POLICY.minimumPositiveReviewShare) {
    color = 'YELLOW'
    reason = 'mixed_feedback'
  } else if (
    stats.publicCommentCount < COMMUNITY_TRUST_POLICY.minimumPublicComments ||
    stats.publicReplyCount < COMMUNITY_TRUST_POLICY.minimumPublicReplies
  ) {
    color = 'YELLOW'
    reason = 'insufficient_discussion'
  } else {
    color = 'GREEN'
    reason = 'positive_community_activity'
  }

  return { ...stats, color, reason, positiveReviewShare, policy: COMMUNITY_TRUST_POLICY, calculatedAt }
}
