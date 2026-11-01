import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest, type AppUser } from './lib/auth'

type MfaSetup = { secret: string; otpAuthUri: string; expiresInMinutes: number }


function PasswordInput({ id, label, value, onChange, autoComplete = 'current-password' }: {
  id: string; label: string; value: string; onChange: (value: string) => void; autoComplete?: string
}) {
  const [visible, setVisible] = useState(false)
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <div className="password-input-wrap">
      <input className="form-control" id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        minLength={8} maxLength={128} required value={value} onChange={event => onChange(event.target.value)} />
      <button className="password-toggle" type="button" aria-label={visible ? 'Hide password' : 'Show password'}
        aria-controls={id} aria-pressed={visible} onClick={() => setVisible(current => !current)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>
}

export function AccountSecurity({ user }: { user: AppUser }) {
  const navigate = useNavigate()
  const [enabled, setEnabled] = useState(user.mfaEnabled)
  const [mfaConfigured, setMfaConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    void apiRequest<{ enabled: boolean; configured: boolean }>('/api/auth/mfa/status').then(result => {
      if (active && result.ok) { setEnabled(result.data.enabled); setMfaConfigured(result.data.configured) }
    })
    return () => { active = false }
  }, [])
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [setupPassword, setSetupPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteCode, setDeleteCode] = useState('')
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function beginSetup(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<MfaSetup>('/api/auth/mfa/setup', { method: 'POST', body: JSON.stringify({ password: setupPassword }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setSetup(result.data); setSetupCode('')
    setNotice('Add this key to your authenticator app, then enter its current six-digit code to confirm setup.')
  }

  async function enableMfa(event: FormEvent) {
    event.preventDefault(); if (!setup) return
    setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ enabled: boolean; recoveryCodes: string[] }>('/api/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ password: setupPassword, code: setupCode }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEnabled(true); setSetup(null); setRecoveryCodes(result.data.recoveryCodes); setSetupCode(''); setSetupPassword('')
    setNotice('Two-factor authentication is enabled. Save your recovery codes now; they will not be shown again.')
  }

  async function disableMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ enabled: boolean }>('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: disablePassword, code: disableCode }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEnabled(false); setDisablePassword(''); setDisableCode(''); setRecoveryCodes([])
    setNotice('Two-factor authentication has been disabled.')
  }

  async function copyRecoveryCodes() {
    try { await navigator.clipboard.writeText(recoveryCodes.join('\n')); setNotice('Recovery codes copied. Store them somewhere private and safe.') }
    catch { setError('Clipboard access is unavailable. Select and copy the codes manually.') }
  }

  async function endSessions(allDevices: boolean) {
    setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ loggedOut: boolean }>('/api/auth/' + (allDevices ? 'logout-all' : 'logout'), { method: 'POST', body: '{}' })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    navigate('/login', { replace: true })
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    if (deleteConfirmation !== 'DELETE') { setError('Type DELETE exactly to confirm.'); return }
    setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ deleted: boolean }>('/api/account/delete', { method: 'POST', body: JSON.stringify({ password: deletePassword, confirmText: deleteConfirmation, ...(enabled ? { code: deleteCode } : {}) }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setNotice('Your account and your submitted property listings have been deleted.')
    navigate('/', { replace: true })
  }

  return <section className="form-card account-security" aria-labelledby="account-security-title">
    <h2 id="account-security-title">Security and account</h2>
    <p className="muted">Protect sign-in with an authenticator app and manage your account data.</p>
    <div className="security-status"><strong>Two-factor authentication</strong><span className={enabled ? 'security-pill on' : 'security-pill'}>{enabled ? 'Enabled' : 'Optional · not enabled'}</span></div>
    {!enabled && mfaConfigured === false && <p className="status-message error" role="status">Two-factor setup is not configured on the server yet. The site administrator must add a Cloudflare Worker Secret named MFA_ENCRYPTION_KEY (at least 32 characters) under Settings → Variables and Secrets, then retry.</p>}
    {enabled && mfaConfigured === false && <p className="status-message error" role="status">The encryption secret is missing. If authenticator codes fail, use an unused recovery code to sign in and contact the site administrator before changing security settings.</p>}
    {!enabled && !setup && <form onSubmit={beginSetup}>
      <p>Use an authenticator app that supports time-based one-time passwords (TOTP). ZameenHub will show you a setup key; the secret is encrypted at rest.</p>
      <PasswordInput id="mfa-setup-password" label="Current password" value={setupPassword} onChange={setSetupPassword} />
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Starting setup…' : 'Set up authenticator'}</button>
    </form>}
    {setup && <div className="mfa-setup">
      <h3>1. Add the key to your authenticator</h3>
      <p>In your authenticator app, choose “Enter setup key” and add this account.</p>
      <label htmlFor="mfa-secret">Setup key (visible only during setup)</label>
      <input id="mfa-secret" className="form-control mfa-secret" readOnly value={setup.secret} onFocus={e => e.currentTarget.select()} />
      <p className="muted">Account: {user.email} · Issuer: ZameenHub · Key expires in {setup.expiresInMinutes} minutes.</p>
      <p><a href={setup.otpAuthUri}>Open in an authenticator app</a></p>
      <h3>2. Confirm it works</h3>
      <form onSubmit={enableMfa}>
        <div className="form-field"><label htmlFor="mfa-setup-code">Six-digit authenticator code</label><input className="form-control" id="mfa-setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={setupCode} onChange={e => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Verifying…' : 'Enable two-factor authentication'}</button>
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => { setSetup(null); setSetupPassword(''); setSetupCode(''); setError(''); setNotice('Setup cancelled.') }}>Cancel</button>
      </form>
    </div>}
    {enabled && <form onSubmit={disableMfa} className="security-subsection">
      <h3>Disable two-factor authentication</h3>
      <p>Confirm your password and an authenticator or unused recovery code. Disabling this removes the second sign-in step.</p>
      <PasswordInput id="mfa-disable-password" label="Current password" value={disablePassword} onChange={setDisablePassword} />
      <div className="form-field"><label htmlFor="mfa-disable-code">Authenticator or recovery code</label><input className="form-control" id="mfa-disable-code" autoComplete="one-time-code" required value={disableCode} onChange={e => setDisableCode(e.target.value)} /></div>
      <button className="btn btn-outline" disabled={busy}>{busy ? 'Updating…' : 'Disable two-factor authentication'}</button>
    </form>}
    {recoveryCodes.length > 0 && <div className="recovery-codes">
      <h3>Your recovery codes</h3>
      <p><strong>Save these now.</strong> Each code works once. Anyone who gets these codes may be able to access your account.</p>
      <textarea className="form-control" rows={5} readOnly aria-label="One-time recovery codes" value={recoveryCodes.join('\n')} onFocus={e => e.currentTarget.select()} />
      <button className="btn btn-outline" type="button" onClick={() => void copyRecoveryCodes()}>Copy recovery codes</button>
      <button className="btn btn-outline" type="button" onClick={() => { setRecoveryCodes([]); setNotice('Recovery codes hidden. They cannot be displayed again.') }}>I saved them</button>
    </div>}
    <div className="security-subsection">
      <h3>Active sessions</h3>
      <p>End the session on this device, or sign out every device connected to your account. Signing out everywhere revokes all sessions immediately.</p>
      <div className="listing-actions">
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => void endSessions(false)}>Sign out this device</button>
        <button className="btn btn-outline" type="button" disabled={busy} onClick={() => void endSessions(true)}>Sign out all devices</button>
      </div>
    </div>
    <div className="danger-zone">
      <h3>Delete account</h3>
      <p>This permanently deletes your account and the property listings you submitted. This action cannot be undone. If two-factor authentication is enabled, you must also confirm with its code.</p>
      <form onSubmit={deleteAccount}>
        <PasswordInput id="delete-account-password" label="Current password" value={deletePassword} onChange={setDeletePassword} />
        {enabled && <div className="form-field"><label htmlFor="delete-account-code">Authenticator or unused recovery code</label><input className="form-control" id="delete-account-code" required value={deleteCode} onChange={e => setDeleteCode(e.target.value)} /></div>}
        <div className="form-field"><label htmlFor="delete-account-confirmation">Type DELETE to confirm</label><input className="form-control" id="delete-account-confirmation" required autoComplete="off" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} /></div>
        <button className="btn btn-danger" disabled={busy || deleteConfirmation !== 'DELETE'}>{busy ? 'Deleting…' : 'Permanently delete account'}</button>
      </form>
    </div>
    {error && <p className="status-message error" role="alert">{error}</p>}
    {notice && <p className="status-message success" role="status">{notice}</p>}
  </section>
}
