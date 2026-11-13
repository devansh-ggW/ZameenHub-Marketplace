import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SectionKicker, EmptyState } from './components'
import { apiRequest, getSession, type AppUser } from './lib/auth'

type Report = {
  id: string
  property_id: string
  reason: string
  details: string
  status: 'submitted' | 'under_review'
  evidence_url: string
  threshold_eligible: number
  created_at: string
  resolution_note: string
  property_title: string
  property_slug: string
  property_city: string
  property_status: 'pending' | 'published' | 'rejected' | 'archived'
}
const reasonLabel: Record<string,string> = {
  suspected_fraud:'Suspected fraud or scam', ownership_fraud:'Suspected ownership fraud',
  forged_documents:'Potentially forged documents', known_dispute:'Known dispute or litigation',
  incorrect_price:'Incorrect price', incorrect_property_info:'Incorrect property information',
  misleading_photos:'Misleading photographs', duplicate:'Duplicate listing',
  unavailable:'Property unavailable', unauthorized_listing:'Unauthorized listing',
  misleading_details:'Misleading details', suspected_scam:'Suspected scam', other:'Other concern',
}

export function ReportQueuePage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<AppUser | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const session = await getSession()
    if (!session.ok) {
      setError('We could not check your sign-in right now. Your session has not been cleared. Check your connection and retry.')
      setLoading(false); return
    }
    if (!session.data.authenticated || !session.data.user) {
      navigate('/login?next=' + encodeURIComponent('/report-queue'), { replace: true })
      setLoading(false); return
    }
    setUser(session.data.user)
    if (!['admin', 'moderator'].includes(session.data.user.role)) {
      setError('You do not have permission to review reports.')
      setLoading(false); return
    }
    const result = await apiRequest<Report[]>('/api/admin/reports')
    if (result.ok) setReports(result.data)
    else setError(result.error)
    setLoading(false)
  }, [navigate])

  useEffect(() => { void load() }, [load])

  async function updateReport(report: Report, status: 'under_review' | 'substantiated' | 'resolved' | 'dismissed') {
    let resolutionNote = ''
    if (status !== 'under_review') {
      const note = window.prompt(status === 'substantiated' ? 'Explain the evidence supporting this report (at least 8 characters):' : status === 'resolved' ? 'Summarize the action or decision taken (at least 8 characters):' : 'Explain why this report is being dismissed (at least 8 characters):')
      if (note === null) return
      if (note.trim().length < 8) { setError('Please record a resolution note with at least 8 characters.'); return }
      resolutionNote = note.trim()
    }
    setBusyId(report.id); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; status: string }>(`/api/admin/reports/${encodeURIComponent(report.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, resolutionNote }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setNotice(status === 'under_review' ? 'Report assigned for review.' : status === 'substantiated' ? 'Report marked substantiated.' : status === 'resolved' ? 'Report marked resolved.' : 'Report dismissed and excluded from the eligible report count.')
    if (status === 'under_review') setReports(current => current.map(item => item.id === report.id ? { ...item, status: 'under_review' } : item))
    else setReports(current => current.filter(item => item.id !== report.id))
  }

  async function archiveReportedListing(report: Report) {
    if (report.property_status !== 'published') { setError('Only a currently published listing can be archived here.'); return }
    const note = window.prompt('Explain why this reported listing should be taken offline (at least 8 characters). Review the evidence first; a report alone is not proof of fraud:')
    if (note === null) return
    if (note.trim().length < 8) { setError('Archiving cancelled. Add at least 8 characters of evidence-based notes.'); return }
    setBusyId(report.id); setError(''); setNotice('')
    const result = await apiRequest<{ status: string; priorStatus: string; auditRecorded: boolean }>(`/api/admin/properties/${encodeURIComponent(report.property_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'archived', reviewNote: note.trim() }),
    })
    setBusyId('')
    if (!result.ok) { setError(result.error); return }
    setReports(current => current.map(item => item.id === report.id ? { ...item, property_status: 'archived' } : item))
    setNotice('Listing archived and removed from public search. The report remains open until you record its outcome.')
  }

  return <main className="page-shell"><div className="container">
    <div className="page-title"><SectionKicker>Safety and moderation</SectionKicker><h1>Listing reports.</h1><p>Investigate reported listings, compare each report with the available property evidence, and document the outcome. A report is an allegation, not proof.</p></div>
    {loading ? <p className="status-message">Loading reports…</p> : <>
      {user && !['admin', 'moderator'].includes(user.role) && <p className="status-message error" role="alert">{error}</p>}
      {error && user && ['admin', 'moderator'].includes(user.role) && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      {!error && reports.length === 0 && <EmptyState title="No open reports." copy="New reports will appear here for authorized moderators and administrators." />}
      {!error && reports.length > 0 && <div className="report-queue">{reports.map(report => <article className="report-card" key={report.id}>
        <div className="report-card-head"><div><span className={'report-status report-status-' + report.status}>{report.status === 'submitted' ? 'Submitted' : 'Under review'}</span><h2>{report.property_title}</h2><p>{report.property_city} · {reasonLabel[report.reason] ?? report.reason}</p></div><span className="mono">{new Date(report.created_at).toLocaleDateString('en-IN')}</span></div>
        <p className="report-evidence">{report.details}</p>
        <p className="muted">Eligible for the public indicator: {report.threshold_eligible ? 'Yes' : 'No'}</p>
        {report.evidence_url && <p><a href={report.evidence_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open reporter evidence link ↗</a></p>}
        <p className="muted">Reported listing: {report.property_status === 'published' ? <Link to={'/properties/' + report.property_slug} target="_blank" rel="noreferrer">Open property</Link> : <span>Not publicly available · {report.property_status}</span>}</p>
        <p className="muted">Review the seller-provided property details and evidence independently before taking moderation action.</p>
        <div className="report-actions">
          {report.status === 'submitted' && <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void updateReport(report, 'under_review')}>Start review</button>}
          {report.property_status === 'published' && <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void archiveReportedListing(report)}>{busyId === report.id ? 'Archiving…' : 'Archive listing'}</button>}
          <button className="btn btn-primary" disabled={busyId === report.id} onClick={() => void updateReport(report, 'substantiated')}>Substantiate</button>
          <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void updateReport(report, 'resolved')}>Resolve</button>
          <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void updateReport(report, 'dismissed')}>Dismiss</button>
        </div>
      </article>)}</div>}
    </>}
    {user && ['admin','moderator'].includes(user.role) && <CommunityContentReportQueue />}
  </div></main>
}

type CommunityContentReport = {
  id:string
  property_id:string
  target_type:'review'|'comment'
  target_id:string
  reporter_id:string|null
  reason:string
  details:string
  status:'submitted'|'under_review'|'substantiated'
  created_at:string
  reported_content:string|null
  content_author:string
}
function CommunityContentReportQueue() {
  const [reports,setReports]=useState<CommunityContentReport[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const response=await apiRequest<CommunityContentReport[]>('/api/admin/community-reports')
    if(response.ok)setReports(response.data)
    else setError(response.error)
    setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  async function moderate(report:CommunityContentReport,status:'under_review'|'substantiated'|'dismissed'|'resolved'|'overturned'){
    let resolutionNote=''
    if(status!=='under_review'){
      const note=window.prompt(status==='substantiated'?'Explain the evidence supporting this moderation finding (at least 8 characters):':status==='overturned'?'Explain why the earlier substantiated finding is being overturned (at least 8 characters):':status==='resolved'?'Summarize why this report is resolved (at least 8 characters):':'Explain why this report is being dismissed (at least 8 characters):')
      if(note===null)return
      if(note.trim().length<8){setError('Add an evidence-based moderation note of at least 8 characters.');return}
      resolutionNote=note.trim()
    }
    setBusy(report.id);setError('');setNotice('')
    const response=await apiRequest<{status:string;contentHidden:boolean;contentRestored:boolean}>('/api/admin/community-reports/'+encodeURIComponent(report.id),{
      method:'PATCH',body:JSON.stringify({status,resolutionNote})
    })
    setBusy('')
    if(!response.ok){setError(response.error);return}
    setReports(current=>status==='under_review'||status==='substantiated'?current.map(item=>item.id===report.id?{...item,status}:item):current.filter(item=>item.id!==report.id))
    setNotice(status==='substantiated'?'Finding recorded; the reported contribution has been hidden.':status==='overturned'?(response.data.contentRestored?'Finding overturned; the contribution has been restored.':'Finding overturned; the original contribution is no longer available to restore.') :status==='dismissed'?'Report dismissed; its audit history remains.':status==='resolved'?'Report marked resolved.':'Report moved under review.')
  }
  return <section className="community-moderation-queue" aria-labelledby="community-moderation-title">
    <div className="page-title"><SectionKicker>Community safety</SectionKicker><h2 id="community-moderation-title">Reviews and discussion reports.</h2><p>Only authorized administrators and moderators can see reporter details. Substantiating a report hides the reported contribution. An overturned finding restores it when the original content still exists; all actions remain in the audit trail.</p></div>
    {loading?<p className="status-message">Loading community reports…</p>:<>
      {error&&<p className="status-message error" role="alert">{error}</p>}
      {notice&&<p className="status-message" role="status">{notice}</p>}
      {!error&&!reports.length&&<EmptyState title="No outstanding community reports." copy="New reports and substantiated findings awaiting reconsideration will appear here."/>}
      {!!reports.length&&<div className="report-queue">{reports.map(report=><article className="report-card" key={report.id}>
        <div className="report-card-head"><div><span className={'report-status report-status-'+report.status}>{report.status==='submitted'?'Submitted':report.status==='under_review'?'Under review':'Substantiated · hidden'}</span><h3>{report.target_type==='review'?'Customer review':'Discussion contribution'}</h3><p>{report.reason.replaceAll('_',' ')} · {new Date(report.created_at).toLocaleDateString('en-IN')}</p></div><span className="mono">{report.target_id}</span></div>
        <p><strong>Reported author:</strong> {report.content_author}</p>
        <blockquote className="community-reported-content">{report.reported_content||'The original contribution is no longer available.'}</blockquote>
        <p><strong>Report explanation:</strong> {report.details}</p>
        <p className="muted">Reporter account: {report.reporter_id||'Deleted account'} · Property ID: {report.property_id}</p>
        <div className="report-actions">
          {report.status==='substantiated'
            ? <button className="btn btn-primary" disabled={busy===report.id} onClick={()=>void moderate(report,'overturned')}>Overturn & restore content</button>
            : <>
              {report.status==='submitted'&&<button className="btn btn-outline" disabled={busy===report.id} onClick={()=>void moderate(report,'under_review')}>Start review</button>}
              <button className="btn btn-primary" disabled={busy===report.id} onClick={()=>void moderate(report,'substantiated')}>Substantiate & hide content</button>
              <button className="btn btn-outline" disabled={busy===report.id} onClick={()=>void moderate(report,'resolved')}>Resolve</button>
              <button className="btn btn-outline" disabled={busy===report.id} onClick={()=>void moderate(report,'dismissed')}>Dismiss</button>
            </>}
        </div>
      </article>)}</div>}
    </>}
  </section>
}
