import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

type CookieChoice = {
  essential: true
  analytics: boolean
  advertising: boolean
  savedAt: string
}
const CONSENT_KEY = 'zameenhub-cookie-consent-v1'

export function CookieNotice() {
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [advertising, setAdvertising] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONSENT_KEY)
      if (!raw) { setVisible(true); return }
      const choice = JSON.parse(raw) as Partial<CookieChoice>
      if (choice.essential === true && typeof choice.analytics === 'boolean' && typeof choice.advertising === 'boolean') {
        setAnalytics(choice.analytics)
        setAdvertising(choice.advertising)
        setSaved(true)
      } else setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  function saveChoice(nextAnalytics: boolean, nextAdvertising: boolean) {
    const choice: CookieChoice = {
      essential: true,
      analytics: nextAnalytics,
      advertising: nextAdvertising,
      savedAt: new Date().toISOString(),
    }
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify(choice)) }
    catch { /* Keep the selection in memory for this visit if storage is unavailable. */ }
    setAnalytics(nextAnalytics)
    setAdvertising(nextAdvertising)
    setSaved(true)
    setVisible(false)
    setSettingsOpen(false)
  }

  function openSettings() {
    setVisible(true)
    setSettingsOpen(true)
  }

  return <>
    {visible && <aside className="cookie-notice" role="dialog" aria-modal="false" aria-label="Cookie preferences">
      <div className="cookie-notice-main">
        <div><strong>Choose your cookie preferences</strong><p>Essential cookies keep your sign-in secure and are always on. Optional analytics and advertising cookies are currently not loaded by ZameenHub. <Link to="/cookies">Read the cookie policy</Link>.</p></div>
        <div className="cookie-notice-actions">
          <button className="btn btn-outline" type="button" onClick={() => saveChoice(false, false)}>Essentials only</button>
          <button className="btn btn-outline" type="button" onClick={() => setSettingsOpen(open => !open)}>{settingsOpen ? 'Hide preferences' : 'Customize'}</button>
          <button className="btn btn-primary" type="button" onClick={() => saveChoice(true, true)}>Accept all</button>
        </div>
      </div>
      {settingsOpen && <div className="cookie-preferences">
        <div className="cookie-preference-row"><div><strong>Essential</strong><p>Required for secure sessions and two-factor sign-in.</p></div><label><input type="checkbox" checked disabled /> Always on</label></div>
        <div className="cookie-preference-row"><div><strong>Analytics</strong><p>Optional performance measurement. No analytics cookies are currently active.</p></div><label><input type="checkbox" checked={analytics} onChange={event => setAnalytics(event.target.checked)} /> Allow</label></div>
        <div className="cookie-preference-row"><div><strong>Advertising</strong><p>Optional advertising and measurement. No advertising cookies are currently active.</p></div><label><input type="checkbox" checked={advertising} onChange={event => setAdvertising(event.target.checked)} /> Allow</label></div>
        <div className="cookie-notice-actions"><button className="btn btn-primary" type="button" onClick={() => saveChoice(analytics, advertising)}>Save choices</button></div>
      </div>}
    </aside>}
    {saved && !visible && <button className="cookie-settings-trigger" type="button" onClick={openSettings}>Cookie settings</button>}
  </>
}
