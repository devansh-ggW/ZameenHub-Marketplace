import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from './lib/auth'

const reasonOptions = [
  ['suspected_fraud', 'Suspected scam or fraud'],
  ['incorrect_price', 'Incorrect price'],
  ['duplicate', 'Duplicate listing'],
  ['unavailable', 'Property is unavailable'],
  ['misleading_details', 'Misleading property details'],
  ['other', 'Other concern'],
] as const

export function ReportProperty({ propertyId, slug }: { propertyId: string; slug: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>('suspected_fraud')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ id: string; status: string; message: string }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ propertyId, reason, details: details.trim() }),
    })
    setBusy(false)
    if (!result.ok) {
      if (result.status === 401) {
        setError('Sign in before submitting a report.')
      } else setError(result.error)
      return
    }
    setNotice(result.data.message)
    setDetails('')
    setOpen(false)
  }

  return <section className="property-report">
    <button className="report-toggle" type="button" aria-expanded={open} onClick={() => { setOpen(current => !current); setError(''); setNotice('') }}>{open ? 'Cancel report' : 'Report this listing'}</button>
    {notice && <p className="status-message success" role="status">{notice}</p>}
    {open && <div className="report-panel">
      <h3>Tell us what looks wrong</h3>
      <p>Reports are reviewed by the moderation team. A report is not an automatic finding that the owner committed fraud.</p>
      <form onSubmit={submit}>
        <div className="form-field"><label htmlFor={'report-reason-' + propertyId}>Reason</label><select className="form-control" id={'report-reason-' + propertyId} value={reason} onChange={e => setReason(e.target.value)}>{reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="form-field"><label htmlFor={'report-details-' + propertyId}>Details or evidence</label><textarea className="form-control" id={'report-details-' + propertyId} required minLength={10} maxLength={1200} value={details} onChange={e => setDetails(e.target.value)} placeholder="Explain the specific issue. Do not include passwords or one-time codes." /></div>
        {error && <p className="status-message error" role="alert">{error} {error.includes('Sign in') && <Link to={'/login?next=' + encodeURIComponent('/properties/' + slug)}>Sign in</Link>}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</button>
      </form>
    </div>}
  </section>
}
