import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SectionKicker } from './components'
import { apiRequest, safeNext } from './lib/auth'

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim()
type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string
    action: string
    callback: (token: string) => void
    'expired-callback': () => void
    'error-callback': () => void
    theme?: 'light' | 'dark' | 'auto'
  }) => string
  reset: (widgetId?: string) => void
  remove?: (widgetId: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

function BotVerification({ action, onToken, resetVersion }: { action: 'signup' | 'login'; onToken: (token: string) => void; resetVersion: number }) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef('')
  const onTokenRef = useRef(onToken)
  useEffect(() => { onTokenRef.current = onToken }, [onToken])

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !container.current) return
    let cancelled = false
    let script = document.querySelector<HTMLScriptElement>('script[data-zameenhub-turnstile]')
    const render = () => {
      if (cancelled || !container.current || !window.turnstile || widgetId.current) return
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action,
        theme: 'light',
        callback: token => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      })
    }
    if (!script) {
      script = document.createElement('script')
      script.dataset.zameenhubTurnstile = 'true'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    if (window.turnstile) render()
    else script.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
      if (widgetId.current && window.turnstile?.remove) window.turnstile.remove(widgetId.current)
      widgetId.current = ''
    }
  }, [action])

  useEffect(() => {
    onTokenRef.current('')
    if (resetVersion > 0 && widgetId.current) window.turnstile?.reset(widgetId.current)
  }, [resetVersion])

  if (!TURNSTILE_SITE_KEY) return <p className="status-message error bot-verification-warning" role="alert">Bot verification is not configured on this deployment yet. Please contact support before signing in or creating an account.</p>
  return <div className="bot-verification"><div ref={container} /><small>Complete this check to help prevent automated account abuse.</small></div>
}

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
  const [mfaRequired, setMfaRequired] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resending, setResending] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileResetVersion, setTurnstileResetVersion] = useState(0)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    if (!mfaRequired && !TURNSTILE_SITE_KEY) { setError('Bot verification is not configured on this deployment. Please contact support.'); return }
    if (!mfaRequired && !turnstileToken) { setError('Complete the bot verification before continuing.'); return }
    const result = mode === 'signup'
      ? await apiRequest<{ message?: string; user?: { id: string }; mfaRequired?: boolean }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, acceptedTerms, next, turnstileToken }) })
      : mfaRequired
        ? await apiRequest<{ message?: string; user?: { id: string }; mfaRequired?: boolean }>('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code: mfaCode }) })
        : await apiRequest<{ message?: string; user?: { id: string }; mfaRequired?: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, turnstileToken }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); if (!mfaRequired) { setTurnstileToken(''); setTurnstileResetVersion(version => version + 1) } return }
    if (mode === 'signup') setNotice(result.data.message || 'Check your email for the verification link. If you already have an account, sign in or use password recovery.')
    else if (!mfaRequired && result.data.mfaRequired) { setMfaRequired(true); setPassword(''); setNotice('Enter the six-digit code from your authenticator app, or use one unused recovery code.'); }
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
      {!mfaRequired ? <><div className="form-field"><label htmlFor="auth-email">Email address</label><input className="form-control" id="auth-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} /></div>
      <PasswordField id="auth-password" label="Password" value={password} onChange={setPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} helpText="Use at least 8 characters and avoid reusing a password." /></> : <div className="form-field"><label htmlFor="auth-mfa-code">Authenticator or recovery code</label><input className="form-control" id="auth-mfa-code" inputMode="text" autoComplete="one-time-code" required maxLength={40} value={mfaCode} onChange={e => setMfaCode(e.target.value)} autoFocus /><small>Authenticator codes have six digits. Recovery codes can be entered without spaces.</small></div>}
      {!mfaRequired && <BotVerification action={mode === 'signup' ? 'signup' : 'login'} onToken={setTurnstileToken} resetVersion={turnstileResetVersion} />}
      {mode === 'signup' && <label className="terms-consent"><input type="checkbox" checked={acceptedTerms} required onChange={e => setAcceptedTerms(e.target.checked)} /><span>I agree to the <Link to="/terms">Terms</Link> and acknowledge the <Link to="/privacy">Privacy Policy</Link>.</span></label>}
      {error && <p className="status-message error" role="alert">{error}</p>}
      {notice && <p className="status-message success" role="status">{notice}</p>}
      <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || (!mfaRequired && (!TURNSTILE_SITE_KEY || !turnstileToken))}>{busy ? 'Please wait…' : mfaRequired ? 'Verify code' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
      {mfaRequired && <button className="btn btn-outline" type="button" style={{ width: '100%', marginTop: 10 }} disabled={busy} onClick={() => { setMfaRequired(false); setMfaCode(''); setError(''); setNotice('') }}>Back to sign in</button>}
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
