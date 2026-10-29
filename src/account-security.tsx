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
  const [authenticatorEnabled, setAuthenticatorEnabled] = useState(user.mfaAuthenticatorEnabled)
  const [emailEnabled, setEmailEnabled] = useState(user.mfaEmailEnabled)
  const [mfaConfigured, setMfaConfigured] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    void apiRequest<{ enabled: boolean; authenticatorEnabled: boolean; emailEnabled: boolean; configured: boolean }>('/api/auth/mfa/status').then(result => {
      if (active && result.ok) { setEnabled(result.data.enabled); setAuthenticatorEnabled(result.data.authenticatorEnabled); setEmailEnabled(result.data.emailEnabled); setMfaConfigured(result.data.configured) }
    })
    return () => { active = false }
  }, [])
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [setupPassword, setSetupPassword] = useState('')
  const [setupCode, setSetupCode] = useState('')
  const [emailSetupPassword, setEmailSetupPassword] = useState('')
  const [emailSetupCode, setEmailSetupCode] = useState('')
  const [emailSetupSent, setEmailSetupSent] = useState(false)
  const [emailDisablePassword, setEmailDisablePassword] = useState('')
  const [emailDisableCode, setEmailDisableCode] = useState('')
  const [emailDisableSent, setEmailDisableSent] = useState(false)
  const [deleteEmailCodeSent, setDeleteEmailCodeSent] = useState(false)
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
    setEnabled(true); setAuthenticatorEnabled(true); setSetup(null); setRecoveryCodes(result.data.recoveryCodes); setSetupCode(''); setSetupPassword('')
    setNotice('Two-factor authentication is enabled. Save your recovery codes now; they will not be shown again.')
  }

  async function disableMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ enabled: boolean }>('/api/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: disablePassword, code: disableCode }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setAuthenticatorEnabled(false); setEnabled(emailEnabled); setDisablePassword(''); setDisableCode(''); setRecoveryCodes([])
    setNotice(emailEnabled ? 'Authenticator verification was disabled. Email two-step verification remains active.' : 'Two-factor authentication has been disabled.')
  }

  async function requestEmailCode(purpose: 'setup' | 'disable' | 'delete', password: string) {
    setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ sent: boolean; emailHint: string; expiresInMinutes: number }>('/api/auth/mfa/email/action-code', {
      method: 'POST', body: JSON.stringify({ purpose, password }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return false }
    setNotice('A one-time code was sent to ' + result.data.emailHint + '. It expires in ' + result.data.expiresInMinutes + ' minutes.')
    return true
  }

  async function beginEmailSetup(event: FormEvent) {
    event.preventDefault()
    if (await requestEmailCode('setup', emailSetupPassword)) { setEmailSetupSent(true); setEmailSetupCode('') }
  }

  async function enableEmailMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ enabled: boolean; emailEnabled: boolean; authenticatorEnabled: boolean }>('/api/auth/mfa/email/enable', {
      method: 'POST', body: JSON.stringify({ password: emailSetupPassword, code: emailSetupCode }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEmailEnabled(true); setEnabled(true); setEmailSetupSent(false); setEmailSetupPassword(''); setEmailSetupCode('')
    setNotice('Email two-step verification is enabled. A code will be required when you sign in.')
  }

  async function beginEmailDisable(event: FormEvent) {
    event.preventDefault()
    if (await requestEmailCode('disable', emailDisablePassword)) { setEmailDisableSent(true); setEmailDisableCode('') }
  }

  async function disableEmailMfa(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ enabled: boolean; emailEnabled: boolean; authenticatorEnabled: boolean }>('/api/auth/mfa/email/disable', {
      method: 'POST', body: JSON.stringify({ password: emailDisablePassword, code: emailDisableCode }),
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setEmailEnabled(false); setEnabled(authenticatorEnabled); setEmailDisablePassword(''); setEmailDisableCode(''); setEmailDisableSent(false)
    setNotice(authenticatorEnabled ? 'Email verification was disabled. Your authenticator app remains active.' : 'Email two-step verification has been disabled.')
  }

  async function sendDeleteEmailCode() {
    if (await requestEmailCode('delete', deletePassword)) { setDeleteEmailCodeSent(true); setDeleteCode('') }
  }

  async function copyRecoveryCodes() {
    try { await navigator.clipboard.writeText(recoveryCodes.join('\n')); setNotice('Recovery codes copied. Store them somewhere private and safe.') }
    catch { setError('Clipboard access is unavailable. Select and copy the codes manually.') }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    if (deleteConfirmation !== 'DELETE') { setError('Type DELETE exactly to confirm.'); return }
    setBusy(true); setError(''); setNotice('')
    const result = await apiRequest<{ deleted: boolean }>('/api/account/delete', { method: 'POST', body: JSON.stringify({ password: deletePassword, confirmText: deleteConfirmation, ...(authenticatorEnabled ? { code: deleteCode } : {}), ...(emailEnabled && !authenticatorEnabled && deleteEmailCodeSent ? { emailCode: deleteCode } : {}) }) })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setNotice('Your account and your submitted property listings have been deleted.')
    navigate('/', { replace: true })
  }

  return <section className="form-card account-security" aria-labelledby="account-security-title">
    <h2 id="account-security-title">Security and account</h2>
    <p className="muted">Choose email one-time codes, an authenticator app, or both. If one method is unavailable, another enabled method can be used at sign-in.</p>
    <div className="security-status"><strong>Two-step verification</strong><span className={enabled ? 'security-pill on' : 'security-pill'}>{enabled ? 'Enabled' : 'Optional · not enabled'}</span></div>
    <div className="mfa-method-status"><span>Authenticator app <strong>{authenticatorEnabled ? 'Enabled' : 'Off'}</strong></span><span>Email codes <strong>{emailEnabled ? 'Enabled' : 'Off'}</strong></span></div>
    {!authenticatorEnabled && mfaConfigured === false && <p className="status-message error" role="status">Authenticator setup is unavailable until the site administrator configures MFA_ENCRYPTION_KEY. {emailEnabled ? 'Email verification remains active.' : 'Email-based verification can be enabled separately when Resend email delivery is configured.'}</p>}
    {authenticatorEnabled && mfaConfigured === false && <p className="status-message error" role="status">The authenticator encryption secret is missing. Use an enabled email code or an unused recovery code to sign in and contact the site administrator before changing authenticator settings.</p>}
    {!authenticatorEnabled && !setup && <form onSubmit={beginSetup}>
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
    {!emailEnabled && <div className="security-subsection"><h3>Enable email verification</h3><p>A one-time code will be sent to your verified email address through the site's Resend email service.</p>{!emailSetupSent ? <form onSubmit={beginEmailSetup}><PasswordInput id="mfa-email-setup-password" label="Current password" value={emailSetupPassword} onChange={setEmailSetupPassword} /><button className="btn btn-primary" disabled={busy}>{busy ? 'Sending code…' : 'Send setup code'}</button></form> : <form onSubmit={enableEmailMfa}><p className="muted">Enter the six-digit code from your email to finish enabling this method.</p><div className="form-field"><label htmlFor="mfa-email-setup-code">Email setup code</label><input className="form-control" id="mfa-email-setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={emailSetupCode} onChange={event => setEmailSetupCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div><button className="btn btn-primary" disabled={busy}>{busy ? 'Verifying…' : 'Enable email verification'}</button><button className="btn btn-outline" type="button" disabled={busy} onClick={() => { setEmailSetupSent(false); setEmailSetupCode(''); setEmailSetupPassword('') }}>Cancel</button></form>}</div>}
    {emailEnabled && <div className="security-subsection"><h3>Disable email verification</h3><p>Confirm your password and the code sent to your verified email address. Your authenticator method, if enabled, remains active.</p>{!emailDisableSent ? <form onSubmit={beginEmailDisable}><PasswordInput id="mfa-email-disable-password" label="Current password" value={emailDisablePassword} onChange={setEmailDisablePassword} /><button className="btn btn-outline" disabled={busy}>{busy ? 'Sending code…' : 'Send disable confirmation code'}</button></form> : <form onSubmit={disableEmailMfa}><PasswordInput id="mfa-email-disable-password-confirm" label="Current password" value={emailDisablePassword} onChange={setEmailDisablePassword} /><div className="form-field"><label htmlFor="mfa-email-disable-code">Email confirmation code</label><input className="form-control" id="mfa-email-disable-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={emailDisableCode} onChange={event => setEmailDisableCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></div><button className="btn btn-danger" disabled={busy}>{busy ? 'Updating…' : 'Confirm and disable email codes'}</button><button className="btn btn-outline" type="button" disabled={busy} onClick={() => { setEmailDisableSent(false); setEmailDisableCode(''); setEmailDisablePassword('') }}>Cancel</button></form>}</div>}
    {authenticatorEnabled && <form onSubmit={disableMfa} className="security-subsection">
      <h3>Disable two-factor authentication</h3>
      <p>Confirm your password and an authenticator or unused recovery code. Email verification, if enabled, will remain available.</p>
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
    <div className="danger-zone">
      <h3>Delete account</h3>
      <p>This permanently deletes your account and the property listings you submitted. This action cannot be undone. If two-step verification is enabled, confirm with an authenticator/recovery code or, for email-only accounts, a one-time email code.</p>
      <form onSubmit={deleteAccount}>
        <PasswordInput id="delete-account-password" label="Current password" value={deletePassword} onChange={setDeletePassword} />
        {authenticatorEnabled && <div className="form-field"><label htmlFor="delete-account-code">Authenticator or unused recovery code</label><input className="form-control" id="delete-account-code" required value={deleteCode} onChange={e => setDeleteCode(e.target.value)} /></div>}
        {!authenticatorEnabled && emailEnabled && <>{!deleteEmailCodeSent && <button className="btn btn-outline" type="button" disabled={busy || deletePassword.length < 8} onClick={() => void sendDeleteEmailCode()}>{busy ? 'Sending code…' : 'Send account deletion code'}</button>}{deleteEmailCodeSent && <div className="form-field"><label htmlFor="delete-account-code">Email deletion code</label><input className="form-control" id="delete-account-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={deleteCode} onChange={e => setDeleteCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></div>}</>}
        <div className="form-field"><label htmlFor="delete-account-confirmation">Type DELETE to confirm</label><input className="form-control" id="delete-account-confirmation" required autoComplete="off" value={deleteConfirmation} onChange={e => setDeleteConfirmation(e.target.value)} /></div>
        <button className="btn btn-danger" disabled={busy || deleteConfirmation !== 'DELETE' || (authenticatorEnabled && !deleteCode.trim()) || (!authenticatorEnabled && emailEnabled && (!deleteEmailCodeSent || !deleteCode.trim()))}>{busy ? 'Deleting…' : 'Permanently delete account'}</button>
      </form>
    </div>
    {error && <p className="status-message error" role="alert">{error}</p>}
    {notice && <p className="status-message success" role="status">{notice}</p>}
  </section>
}
