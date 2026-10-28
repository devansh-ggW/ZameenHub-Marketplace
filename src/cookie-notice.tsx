import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const NOTICE_KEY = 'zameenhub-cookie-notice-dismissed'

export function CookieNotice() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    try { setVisible(window.localStorage.getItem(NOTICE_KEY) !== 'yes') }
    catch { setVisible(true) }
  }, [])
  function dismiss() {
    try { window.localStorage.setItem(NOTICE_KEY, 'yes') } catch { /* The notice remains dismissible for this page view. */ }
    setVisible(false)
  }
  if (!visible) return null
  return <aside className="cookie-notice" role="region" aria-label="Cookie notice">
    <div><strong>Essential cookies only</strong><p>ZameenHub uses a secure session cookie for sign-in and a short-lived cookie for two-factor sign-in. We do not currently use advertising or analytics cookies. <Link to="/cookies">Read the cookie policy</Link>.</p></div>
    <button className="btn btn-primary" type="button" onClick={dismiss}>Got it</button>
  </aside>
}
