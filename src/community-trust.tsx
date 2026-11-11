import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest, getSession } from './lib/auth'

type TrustSummary = {
  color: 'RED'|'YELLOW'|'GREEN'
  reason: string
  calculatedAt: string
  requiredDocumentCount: number
  eligibleReportCount: number
  totalReports: number
  openReports: number
  substantiatedReports: number
  dismissedReports: number
  ratingDistribution: Array<{rating:number;count:number}>
  eligibleReviewCount: number
  distinctReviewers: number
  averageRating: number
  positiveReviewCount: number
  positiveReviewShare: number
  publicCommentCount: number
  publicReplyCount: number
  documentationSubmitted: number
  explanation: string
  policy: {
    minimumEligibleReviews: number
    minimumDistinctReviewers: number
    minimumAverageRating: number
    minimumPositiveReviewShare: number
    minimumPublicComments: number
    minimumPublicReplies: number
  }
}
type Review = {
  id: string
  reviewerName: string
  rating: number
  body: string
  interactionType: string
  createdAt: string
  updatedAt: string
  isMine: boolean
  response: { body: string; createdAt: string } | null
}
type Comment = {
  id: string
  parentCommentId: string | null
  authorName: string
  authorRole: string
  isOwner: boolean
  body: string
  createdAt: string
  updatedAt: string
  isMine: boolean
}
type CommunityPayload = { summary: TrustSummary; reviews: Review[]; comments: Comment[] }

const indicatorCopy = {
  RED: { title: 'HIGH CAUTION', text: 'Missing evidence or a high number of eligible reports.' },
  YELLOW: { title: 'LIMITED COMMUNITY EVIDENCE', text: 'There is not yet enough positive, varied community feedback.' },
  GREEN: { title: 'POSITIVE COMMUNITY ACTIVITY', text: 'Submitted evidence and community feedback meet the published thresholds.' },
}
const reasonCopy: Record<string,string> = {
  no_ownership_evidence: 'No seller-submitted property documents are currently attached.',
  report_red_threshold: 'Five or more eligible reports have been submitted. Reports are allegations unless substantiated.',
  report_yellow_threshold: 'Three or four eligible reports have been submitted. Reports are allegations unless substantiated.',
  insufficient_reviews: 'At least three reviews from three distinct accounts are required.',
  low_average_rating: 'The average rating is below 4 out of 5.',
  mixed_feedback: 'At least 70% of eligible reviews must be rated 4 or 5 stars.',
  insufficient_discussion: 'At least one public comment and one public reply are required.',
  positive_community_activity: 'All published Community Trust Indicator criteria are currently satisfied.',
}
const dateLabel = (value: string) => new Date(value).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})
const interactionLabel = (value: string) => ({inquiry:'Inquiry experience',viewing:'Property viewing',transaction:'Transaction experience',other:'Other interaction'}[value] || 'Customer interaction')

export function CommunityTrustSection({ propertyId, ownerId }: { propertyId: string; ownerId?: string }) {
  const [data,setData] = useState<CommunityPayload|null>(null)
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [viewerId,setViewerId] = useState('')
  const [reviewBody,setReviewBody] = useState('')
  const [rating,setRating] = useState('5')
  const [interactionType,setInteractionType] = useState('viewing')
  const [commentBody,setCommentBody] = useState('')
  const [replyTo,setReplyTo] = useState('')
  const [replyBody,setReplyBody] = useState('')
  const [editReviewId,setEditReviewId] = useState('')
  const [editReviewBody,setEditReviewBody] = useState('')
  const [editRating,setEditRating] = useState('5')
  const [editInteraction,setEditInteraction] = useState('viewing')
  const [ownerResponseId,setOwnerResponseId] = useState('')
  const [ownerResponseBody,setOwnerResponseBody] = useState('')
  const [notice,setNotice] = useState('')
  const [busy,setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true);setError('')
    const result = await apiRequest<CommunityPayload>('/api/properties/'+encodeURIComponent(propertyId)+'/community')
    if(result.ok)setData(result.data)
    else setError(result.error)
    setLoading(false)
  },[propertyId])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{let active=true;void getSession().then(r=>{if(active&&r.ok)setViewerId(r.data.user?.id||'')});return()=>{active=false}},[])

  const commentsByParent = useMemo(()=>{
    const roots=(data?.comments||[]).filter(item=>!item.parentCommentId)
    return roots.map(root=>({root,replies:(data?.comments||[]).filter(item=>item.parentCommentId===root.id)}))
  },[data?.comments])

  async function submitReview(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('')
    const result=await apiRequest<{message:string}>('/api/properties/'+encodeURIComponent(propertyId)+'/reviews',{method:'POST',body:JSON.stringify({rating:Number(rating),body:reviewBody.trim(),interactionType})})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    setReviewBody('');setNotice(result.data.message);await load()
  }
  async function submitComment(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('')
    const result=await apiRequest<{message:string}>('/api/properties/'+encodeURIComponent(propertyId)+'/comments',{method:'POST',body:JSON.stringify({body:commentBody.trim()})})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    setCommentBody('');setNotice(result.data.message);await load()
  }
  async function submitReply(event:FormEvent) {
    event.preventDefault();if(!replyTo)return
    setBusy(true);const result=await apiRequest<{message:string}>('/api/properties/'+encodeURIComponent(propertyId)+'/comments',{method:'POST',body:JSON.stringify({body:replyBody.trim(),parentCommentId:replyTo})})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    setReplyTo('');setReplyBody('');setNotice(result.data.message);await load()
  }
  async function saveReviewEdit(event:FormEvent) {
    event.preventDefault();if(!editReviewId)return
    setBusy(true);const result=await apiRequest('/api/reviews/'+encodeURIComponent(editReviewId),{method:'PATCH',body:JSON.stringify({rating:Number(editRating),body:editReviewBody.trim(),interactionType:editInteraction})})
    setBusy(false)
    if(!result.ok){setError(result.error);return}
    setEditReviewId('');setNotice('Review updated.');await load()
  }
  async function deleteReview(id:string) {
    if(!window.confirm('Delete this review?'))return
    setBusy(true);const result=await apiRequest('/api/reviews/'+encodeURIComponent(id),{method:'DELETE'});setBusy(false)
    if(!result.ok){setError(result.error);return}
    setNotice('Review deleted.');await load()
  }
  async function deleteComment(id:string) {
    if(!window.confirm('Delete this contribution?'))return
    setBusy(true);const result=await apiRequest('/api/comments/'+encodeURIComponent(id),{method:'DELETE'});setBusy(false)
    if(!result.ok){setError(result.error);return}
    setNotice('Contribution deleted.');await load()
  }
  async function saveOwnerResponse(event:FormEvent) {
    event.preventDefault();if(!ownerResponseId)return
    setBusy(true);const result=await apiRequest('/api/reviews/'+encodeURIComponent(ownerResponseId)+'/response',{method:'POST',body:JSON.stringify({body:ownerResponseBody.trim()})});setBusy(false)
    if(!result.ok){setError(result.error);return}
    setOwnerResponseId('');setOwnerResponseBody('');setNotice('Seller response published.');await load()
  }
  async function report(targetType:'review'|'comment',targetId:string) {
    const reason=window.prompt('Why are you reporting this contribution? (abuse, spam, fake_or_misleading, privacy, other)')
    if(!reason)return
    const details=window.prompt('Describe the specific concern (at least 10 characters).')
    if(!details)return
    setBusy(true);const result=await apiRequest('/api/community/reports',{method:'POST',body:JSON.stringify({propertyId,targetType,targetId,reason:reason.trim().toLowerCase(),details:details.trim()})});setBusy(false)
    if(!result.ok){setError(result.error);return}
    setNotice('Report submitted privately to the moderation team.')
  }

  if(loading)return <section className="community-trust-section"><p className="status-message">Loading community activity…</p></section>
  if(error&&!data)return <section className="community-trust-section"><p className="status-message error" role="alert">{error}</p><button className="btn btn-outline" onClick={()=>void load()}>Retry</button></section>
  if(!data)return null
  const trust=data.summary
  const indicator=indicatorCopy[trust.color]
  const ownerViewing=!!viewerId&&!!ownerId&&viewerId===ownerId

  return <section className="detail-section community-trust-section" aria-labelledby="community-trust-title">
    <div className="community-trust-heading">
      <div><span className="eyebrow">COMMUNITY FEEDBACK · NOT A LEGAL OPINION</span><h2 id="community-trust-title">Community Trust Indicator</h2><p className="muted">DON'T TRUST US. CHECK THE DAMN THING YOURSELF.</p></div>
      <span className={'community-indicator community-indicator-'+trust.color.toLowerCase()}><strong>{trust.color}</strong><small>{indicator.title}</small></span>
    </div>
    <p className="community-indicator-summary">{indicator.text} {reasonCopy[trust.reason]||''}</p>
    <p className="community-green-warning"><strong>GREEN DOES NOT MEAN VERIFIED.</strong> It means the listing has submitted documentation and accumulated sufficiently positive community engagement under the published rules. It does not establish authenticity, ownership, clear title, absence of disputes, possession, condition or transaction safety.</p>
    <div className="community-stat-grid">
      <div><strong>{trust.documentationSubmitted}</strong><span>Evidence items submitted</span></div>
      <div><strong>{trust.eligibleReviewCount}</strong><span>Eligible reviews</span></div>
      <div><strong>{trust.averageRating?trust.averageRating.toFixed(1)+'/5':'—'}</strong><span>Average rating</span></div>
      <div><strong>{trust.publicCommentCount}</strong><span>Comments</span></div>
      <div><strong>{trust.publicReplyCount}</strong><span>Replies</span></div>
      <div><strong>{trust.eligibleReportCount}</strong><span>Eligible reports</span></div>
    </div>
    <details className="community-breakdown">
      <summary>See the full indicator breakdown</summary>
      <div className="community-breakdown-grid">
        <p><strong>Why this colour?</strong><span>{reasonCopy[trust.reason]||'The policy thresholds are applied in a fixed priority order.'}</span></p>
        <p><strong>Distinct reviewers</strong><span>{trust.distinctReviewers} customer accounts</span></p>
        <div className="community-rating-distribution"><strong>Rating distribution</strong>{trust.ratingDistribution.map(item=><div className="community-rating-row" key={item.rating}><span>{item.rating}★</span><div className="community-rating-track"><span style={{width:(trust.eligibleReviewCount?item.count/trust.eligibleReviewCount*100:0)+'%'}}/></div><span>{item.count}</span></div>)}</div>
        <p><strong>Positive reviews</strong><span>{trust.positiveReviewCount} of {trust.eligibleReviewCount} ({Math.round(trust.positiveReviewShare*100)}%)</span></p>
        <p><strong>Eligible reports</strong><span>{trust.totalReports} total · {trust.openReports} submitted/under review</span></p>
        <p><strong>Substantiated reports</strong><span>{trust.substantiatedReports}</span></p>
        <p><strong>Dismissed reports</strong><span>{trust.dismissedReports}</span></p>
        <p><strong>GREEN threshold</strong><span>3 reviews from 3 accounts, 4.0/5 average, 70% positive, 1 comment and 1 reply; fewer than 3 eligible reports.</span></p>
        <p><strong>Last calculated</strong><span>{new Date(trust.calculatedAt).toLocaleString('en-IN')}</span></p>
      </div>
      <p className="muted community-policy-note">Eligible reports include reports that pass basic eligibility and abuse checks. A submitted report is an allegation, not proof. Dismissed spam/duplicate reports remain in the audit history but do not count toward the colour.</p>
    </details>

    <div className="community-content-section">
      <div className="community-section-head"><div><h3>Customer reviews</h3><p className="muted">Only eligible customer accounts count toward the indicator. Seller replies are shown separately.</p></div></div>
      {data.reviews.length?data.reviews.map(review=><article className="community-review" key={review.id}>
        <div className="community-review-head"><div><strong>{review.reviewerName}</strong><span>{interactionLabel(review.interactionType)} · {dateLabel(review.createdAt)}</span></div><span className="community-stars" aria-label={review.rating+' out of 5 stars'}>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</span></div>
        {editReviewId===review.id?<form className="community-inline-form" onSubmit={saveReviewEdit}>
          <select className="form-control" value={editRating} onChange={e=>setEditRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select>
          <select className="form-control" value={editInteraction} onChange={e=>setEditInteraction(e.target.value)}><option value="inquiry">Inquiry</option><option value="viewing">Viewing</option><option value="transaction">Transaction</option><option value="other">Other</option></select>
          <textarea className="form-control" minLength={20} maxLength={2000} required value={editReviewBody} onChange={e=>setEditReviewBody(e.target.value)}/>
          <button className="btn btn-primary" disabled={busy}>Save review</button><button className="btn btn-outline" type="button" onClick={()=>setEditReviewId('')}>Cancel</button>
        </form>:<p>{review.body}</p>}
        {review.response&&<div className="community-owner-response"><strong>Seller response</strong><p>{review.response.body}</p><small>{dateLabel(review.response.createdAt)}</small></div>}
        {review.isMine&&editReviewId!==review.id&&<div className="community-actions"><button className="btn btn-outline" onClick={()=>{setEditReviewId(review.id);setEditReviewBody(review.body);setEditRating(String(review.rating));setEditInteraction(review.interactionType)}}>Edit review</button><button className="btn btn-outline" disabled={busy} onClick={()=>void deleteReview(review.id)}>Delete</button></div>}
        {ownerViewing&&!review.response&&<button className="btn btn-outline" onClick={()=>{setOwnerResponseId(review.id);setOwnerResponseBody('')}}>Respond as listing owner</button>}
        {ownerResponseId===review.id&&<form className="community-inline-form" onSubmit={saveOwnerResponse}><textarea className="form-control" minLength={3} maxLength={1200} required value={ownerResponseBody} onChange={e=>setOwnerResponseBody(e.target.value)} placeholder="Write a public response as the listing owner."/><button className="btn btn-primary" disabled={busy}>Publish response</button><button type="button" className="btn btn-outline" onClick={()=>setOwnerResponseId('')}>Cancel</button></form>}
        <button className="community-report-link" onClick={()=>void report('review',review.id)}>Report review</button>
      </article>):<p className="gallery-empty">No customer reviews have been submitted yet.</p>}
      {!data.reviews.some(review=>review.isMine)&&<form className="community-form" onSubmit={submitReview}>
        <h4>Share an experience</h4><p className="muted">Choose the interaction type honestly. This is not a “verified buyer” badge.</p>
        <div className="community-form-row"><div className="form-field"><label>Rating</label><select className="form-control" value={rating} onChange={e=>setRating(e.target.value)}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></div><div className="form-field"><label>Experience</label><select className="form-control" value={interactionType} onChange={e=>setInteractionType(e.target.value)}><option value="inquiry">Inquiry</option><option value="viewing">Viewing</option><option value="transaction">Transaction</option><option value="other">Other interaction</option></select></div></div>
        <div className="form-field"><label>Review</label><textarea className="form-control" minLength={20} maxLength={2000} required value={reviewBody} onChange={e=>setReviewBody(e.target.value)} placeholder="Describe the actual interaction with this property or listing."/><small>One review per account per property. Do not include private contact or identity information.</small></div>
        <button className="btn btn-primary" disabled={busy}>Submit review</button>
      </form>}
    </div>

    <div className="community-content-section">
      <div className="community-section-head"><div><h3>Property discussion</h3><p className="muted">Ask questions, add context, and reply to other customers. Seller replies are clearly identified.</p></div></div>
      {commentsByParent.length?commentsByParent.map(({root,replies})=><article className="community-comment-thread" key={root.id}>
        <div className="community-comment"><strong>{root.authorName}{root.isOwner?' · Seller':root.authorRole==='admin'?' · Admin':''}</strong><time>{dateLabel(root.createdAt)}</time><p>{root.body}</p>
          {root.isMine&&<div className="community-actions"><button className="btn btn-outline" onClick={()=>{const next=window.prompt('Edit your comment:',root.body);if(next===null||next.trim().length<3)return;void apiRequest('/api/comments/'+encodeURIComponent(root.id),{method:'PATCH',body:JSON.stringify({body:next.trim()})}).then(result=>{if(result.ok){setNotice('Comment updated.');void load()}else setError(result.error)})}}>Edit</button><button className="btn btn-outline" onClick={()=>void deleteComment(root.id)}>Delete</button></div>}
          <button className="community-report-link" onClick={()=>void report('comment',root.id)}>Report comment</button>
          <button className="community-reply-link" onClick={()=>setReplyTo(replyTo===root.id?'':root.id)}>Reply</button>
          {replyTo===root.id&&<form className="community-inline-form" onSubmit={submitReply}><textarea className="form-control" required minLength={3} maxLength={1200} value={replyBody} onChange={e=>setReplyBody(e.target.value)} placeholder="Write a helpful reply."/><button className="btn btn-primary" disabled={busy}>Post reply</button></form>}
        </div>
        {replies.map(reply=><div className="community-comment community-comment-reply" key={reply.id}><strong>{reply.authorName}{reply.isOwner?' · Seller':reply.authorRole==='admin'?' · Admin':reply.isMine?' · You':''}</strong><time>{dateLabel(reply.createdAt)}</time><p>{reply.body}</p>{reply.isMine&&<div className="community-actions"><button className="btn btn-outline" onClick={()=>{const next=window.prompt('Edit your reply:',reply.body);if(next===null||next.trim().length<3)return;void apiRequest('/api/comments/'+encodeURIComponent(reply.id),{method:'PATCH',body:JSON.stringify({body:next.trim()})}).then(result=>{if(result.ok){setNotice('Reply updated.');void load()}else setError(result.error)})}}>Edit</button><button className="btn btn-outline" onClick={()=>void deleteComment(reply.id)}>Delete</button></div>}<button className="community-report-link" onClick={()=>void report('comment',reply.id)}>Report reply</button></div>)}
      </article>):<p className="gallery-empty">No discussion yet. Start with a useful question or observation.</p>}
      <form className="community-form" onSubmit={submitComment}><h4>Start a discussion</h4><div className="form-field"><label>Comment</label><textarea className="form-control" required minLength={3} maxLength={1200} value={commentBody} onChange={e=>setCommentBody(e.target.value)} placeholder="Ask a question or share helpful context." /></div><button className="btn btn-primary" disabled={busy}>Post comment</button></form>
    </div>
    {error&&<p className="status-message error" role="alert">{error}</p>}
    {notice&&<p className="status-message" role="status">{notice}</p>}
    <p className="muted community-disclaimer">Community feedback reflects submitted user experiences and is not a legal determination. Do independent ownership, title, dispute, seller-identity and physical-condition checks before any payment or agreement.</p>
    <p className="muted community-policy-footnote">The published policy requires {trust.policy.minimumEligibleReviews} reviews from {trust.policy.minimumDistinctReviewers} distinct accounts, an average of {trust.policy.minimumAverageRating}/5, at least {Math.round(trust.policy.minimumPositiveReviewShare*100)}% positive ratings, public comments and replies, and fewer than 3 eligible reports for GREEN.</p>
    <p><Link to="/terms">Community rules and terms</Link> · <Link to="/privacy">Privacy information</Link></p>
  </section>
}
