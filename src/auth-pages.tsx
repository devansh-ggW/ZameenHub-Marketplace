import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, safeNext } from './lib/auth'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  minLength?: number
  maxLength?: number
  required?: boolean
  helpText?: string
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength = 8,
  maxLength = 128,
  required = true,
  helpText,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-input-wrap">
      <input
        className="form-control"
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        required={required}
        value={value}
        onChange={event => onChange(event.target.value)}
      />
      <button
        className="password-toggle"
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={id}
        aria-pressed={visible}
        onClick={() => setVisible(current => !current)}
      >{visible ? 'Hide' : 'Show'}</button>
    </div>
    {helpText && <small>{helpText}</small>}
  </div>
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'), '/profile')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resending, setResending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    const result = mode === 'signup'
      ? await apiRequest<{ message?: string; user?: { id: string } }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, acceptedTerms, next }) })
      : await apiRequest<{ message?: string; user?: { id: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    if (mode === 'signup') setNotice(result.data.message || 'Check your email for the verification link. If you already have an account, sign in or use password recovery.')
    else navigate(next, { replace: true })
  }

  async function resend() {
    if (!email.trim()) { setError('Enter your email address first.'); return }
    setResending(true); setError('')
    const result = await apiRequest<{ message: string }>('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email, next }) })
    setResending(false)
    if (result.ok) setNotice(result.data.message)
    else setError(result.error)
  }

  return <main className="auth-wrap"><section className="auth-card" aria-labelledby="auth-title">
    <SectionKicker>{mode === 'login' ? 'Welcome back' : 'Create your account'}</SectionKicker>
    <h1 id="auth-title">{mode === 'login' ? 'Sign in.' : 'Make room for what matters.'}</h1>
    <p>{mode === 'login' ? 'Access saved properties, your profile and your listings.' : 'Verify your email to save properties and submit a listing for review.'}</p>
    <form onSubmit={submit}>
      {mode === 'signup' && <div className="form-field"><label htmlFor="auth-name">Full name</label><input className="form-control" id="auth-name" autoComplete="name" minLength={2} maxLength={100} required value={name} onChange={e => setName(e.target.value)} /></div>}
      <div className="form-field"><label htmlFor="auth-email">Email address</label><input className="form-control" id="auth-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <PasswordField id="auth-password" label="Password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} helpText="Use at least 8 characters and avoid reusing a password." />
      {mode === 'signup' && <label className="terms-consent"><input type="checkbox" checked={acceptedTerms} required onChange={e => setAcceptedTerms(e.target.checked)} /><span>I agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.</span></label>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
    </form>
    {mode === 'signup' && <button className="btn btn-outline" style={{ width: '100%', marginTop: 10 }} disabled={resending} onClick={() => void resend()}>{resending ? 'Sending…' : 'Resend verification / account activation email'}</button>}
    <div className="auth-switch">{mode === 'login' ? <>New to ZameenHub? <Link to={'/signup' + (params.get('next') ? '?next=' + encodeURIComponent(next) : '')}>Create an account</Link><br /><Link to="/forgot-password">Forgot your password?</Link></> : <>Already registered? <Link to={'/login?next=' + encodeURIComponent(next)}>Sign in</Link></>}</div>
    <p className="muted auth-support">Need help? <a href="mailto:dewifystores@gmail.com">dewifystores@gmail.com</a></p>
  </section></main>
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const next = safeNext(params.get('next'), '/profile')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ message: string }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
    setBusy(false)
    if (result.ok) setNotice(result.data.message)
    else setError(result.error)
  }
  return <main className="auth-wrap"><section className="auth-card"><SectionKicker>Email verification</SectionKicker><h1>Confirm your email.</h1><p>Verify your address to finish setting up your ZameenHub account.</p>{!token && <p className="status-message error">This link has no verification token. Request a new email from sign-up.</p>}{error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice} <Link to={'/login?next=' + encodeURIComponent(next)}>Continue to sign in</Link></p>}<form onSubmit={verify}><button className="btn btn-primary" style={{ width: '100%' }} disabled={!token || busy || !!notice}>{busy ? 'Verifying…' : notice ? 'Email verified' : 'Verify email'}</button></form><div className="auth-switch"><Link to="/login">Return to sign in</Link></div></section></main>
}

export function ActivateAccountPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const next = safeNext(params.get('next'), '/profile')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError('')
    const result = await apiRequest<{ message: string }>('/api/auth/activate-account', { method: 'POST', body: JSON.stringify({ token, password, acceptedTerms }) })
    setBusy(false)
    if (result.ok) setNotice(result.data.message)
    else setError(result.error)
  }
  return <main className="auth-wrap"><section className="auth-card"><SectionKicker>Account activation</SectionKicker><h1>Secure your account.</h1><p>This link is for an existing account that needs a password and email confirmation.</p><form onSubmit={submit}>
    <PasswordField id="activate-password" label="Create password" value={password} onChange={setPassword} autoComplete="new-password" />
    <PasswordField id="activate-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
    <label className="terms-consent"><input type="checkbox" checked={acceptedTerms} required onChange={e => setAcceptedTerms(e.target.checked)} /><span>I agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.</span></label>
    {error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice} <Link to={'/login?next=' + encodeURIComponent(next)}>Sign in</Link></p>}
    <button className="btn btn-primary" style={{ width: '100%' }} disabled={!token || busy || !!notice}>{busy ? 'Activating…' : 'Activate account'}</button>
  </form></section></main>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    const result = await apiRequest<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
    setBusy(false)
    if (result.ok) setNotice(result.data.message)
    else setError(result.error)
  }
  return <main className="auth-wrap"><section className="auth-card"><SectionKicker>Account recovery</SectionKicker><h1>Reset your password.</h1><p>Enter your account email. If an account matches, we’ll send recovery instructions.</p><form onSubmit={submit}><div className="form-field"><label htmlFor="recovery-email">Email address</label><input className="form-control" id="recovery-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>{error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice}</p>}<button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>{busy ? 'Sending…' : 'Send recovery email'}</button></form><div className="auth-switch"><Link to="/login">Return to sign in</Link></div></section></main>
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError('')
    const result = await apiRequest<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
    setBusy(false)
    if (result.ok) setNotice(result.data.message)
    else setError(result.error)
  }
  return <main className="auth-wrap"><section className="auth-card"><SectionKicker>Account recovery</SectionKicker><h1>Choose a new password.</h1><form onSubmit={submit}>
    <PasswordField id="reset-password" label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
    <PasswordField id="reset-confirm" label="Confirm password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
    {error && <p className="status-message error" role="alert">{error}</p>}{notice && <p className="status-message success" role="status">{notice} <Link to="/login">Sign in</Link></p>}
    <button className="btn btn-primary" style={{ width: '100%' }} disabled={!token || busy || !!notice}>{busy ? 'Saving…' : 'Reset password'}</button>
  </form></section></main>
}
