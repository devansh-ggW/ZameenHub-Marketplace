import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SectionKicker, EmptyState } from './components'
import { apiRequest, getSession, type AppUser } from './lib/auth'

type Report = {
  id: string
  property_id: string
  reason: string
  details: string
  status: 'open' | 'reviewing'
  created_at: string
  resolution_note: string
  property_title: string
  property_slug: string
  property_city: string
  property_status: 'pending' | 'published' | 'rejected' | 'archived'
}
const reasonLabel: Record<string, string> = {
  suspected_fraud: 'Suspected scam or fraud',
  incorrect_price: 'Incorrect price',
  duplicate: 'Duplicate listing',
  unavailable: 'Property unavailable',
  misleading_details: 'Misleading details',
  other: 'Other concern',
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
    if (!session.ok || !session.data.authenticated || !session.data.user) {
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

  async function updateReport(report: Report, status: 'reviewing' | 'resolved' | 'dismissed') {
    let resolutionNote = ''
    if (status !== 'reviewing') {
      const note = window.prompt(status === 'resolved' ? 'Summarize the action or decision taken (at least 8 characters):' : 'Explain why this report is being dismissed (at least 8 characters):')
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
    setNotice(status === 'reviewing' ? 'Report assigned for review.' : status === 'resolved' ? 'Report marked resolved.' : 'Report dismissed.')
    if (status === 'reviewing') setReports(current => current.map(item => item.id === report.id ? { ...item, status: 'reviewing' } : item))
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
    <div className="page-title"><SectionKicker>Safety and moderation</SectionKicker><h1>Listing reports.</h1><p>Investigate reported listings, document the outcome, and avoid treating a complaint or AI score as proof on its own.</p></div>
    {loading ? <p className="status-message">Loading reports…</p> : <>
      {user && !['admin', 'moderator'].includes(user.role) && <p className="status-message error" role="alert">{error}</p>}
      {error && user && ['admin', 'moderator'].includes(user.role) && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      {!error && reports.length === 0 && <EmptyState title="No open reports." copy="New reports will appear here for authorized moderators and administrators." />}
      {!error && reports.length > 0 && <div className="report-queue">{reports.map(report => <article className="report-card" key={report.id}>
        <div className="report-card-head"><div><span className={'report-status report-status-' + report.status}>{report.status}</span><h2>{report.property_title}</h2><p>{report.property_city} · {reasonLabel[report.reason] ?? report.reason}</p></div><span className="mono">{new Date(report.created_at).toLocaleDateString('en-IN')}</span></div>
        <p className="report-evidence">{report.details}</p>
        <p className="muted">Reported listing: {report.property_status === 'published' ? <Link to={'/properties/' + report.property_slug} target="_blank" rel="noreferrer">Open property</Link> : <span>Not publicly available · {report.property_status}</span>}</p>
        <div className="report-actions">
          {report.status === 'open' && <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void updateReport(report, 'reviewing')}>Start review</button>}
          {report.property_status === 'published' && <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void archiveReportedListing(report)}>{busyId === report.id ? 'Archiving…' : 'Archive listing'}</button>}
          <button className="btn btn-primary" disabled={busyId === report.id} onClick={() => void updateReport(report, 'resolved')}>Resolve</button>
          <button className="btn btn-outline" disabled={busyId === report.id} onClick={() => void updateReport(report, 'dismissed')}>Dismiss</button>
        </div>
      </article>)}</div>}
    </>}
  </div></main>
}
