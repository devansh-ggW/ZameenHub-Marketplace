import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { getSession } from './lib/auth'
import { MotionProvider, ScrollProgress } from './motion'
import { HomePage, PropertiesPage, PropertyDetailPage, NotFoundPage } from './pages'
import { AccountPage } from './account-pages'
import { AuthPage, VerifyEmailPage, ActivateAccountPage, ForgotPasswordPage, ResetPasswordPage } from './auth-pages'
import { InfoPage } from './legal-pages'
import { ListingPage } from './listing-page'
import { EditListingPage } from './edit-listing-page'
import { ReportQueuePage } from './report-queue'
import { InquiriesPage } from './inquiries-page'
import { MessagesPage } from './messages-page'
import { EmiCalculatorPage } from './emi-calculator-page'
import { PublicListerProfilePage } from './public-profile-page'
import { SiteFooter, SiteHeader } from './site-chrome'
import { CookieNotice } from './cookie-notice'

function SessionKeepAlive() {
  useEffect(() => {
    let active = true
    let pending = false
    let lastActivity = Date.now()
    let lastRefresh = 0
    const minimumRefreshGap = 5 * 60 * 1000
    const refresh = async () => {
      const now = Date.now()
      // Only a visible, recently active tab renews the rolling inactivity window.
      // This avoids six-hour gaps and still lets a returning user refresh immediately.
      if (!active || pending || document.visibilityState === 'hidden' ||
          now - lastActivity > 24 * 60 * 60 * 1000 || now - lastRefresh < minimumRefreshGap) return
      pending = true
      try {
        const result = await getSession()
        if (result.ok) lastRefresh = Date.now()
      } catch {
        // A temporary network failure must never clear a valid session.
      } finally {
        pending = false
      }
    }
    const markActivity = () => {
      lastActivity = Date.now()
      void refresh()
    }
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    for (const eventName of activityEvents) window.addEventListener(eventName, markActivity, { passive: true })
    const onReturn = () => markActivity()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') onReturn()
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 10 * 60 * 1000)
    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    window.addEventListener('online', onReturn)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      window.removeEventListener('online', onReturn)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      for (const eventName of activityEvents) window.removeEventListener(eventName, markActivity)
    }
  }, [])
  return null
}

export default function App() {
  return <MotionProvider>
    <ScrollProgress />
    <SessionKeepAlive />
    <SiteHeader />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/properties" element={<PropertiesPage />} />
      <Route path="/properties/:slug" element={<PropertyDetailPage />} />
      <Route path="/people/:id" element={<PublicListerProfilePage />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/signup" element={<AuthPage mode="signup" />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/activate-account" element={<ActivateAccountPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/profile" element={<AccountPage kind="profile" />} />
      <Route path="/saved" element={<AccountPage kind="saved" />} />
      <Route path="/list-property" element={<ListingPage />} />
      <Route path="/edit-listing/:id" element={<EditListingPage />} />
      <Route path="/my-listings" element={<AccountPage kind="my-listings" />} />
      <Route path="/review-queue" element={<AccountPage kind="review-queue" />} />
      <Route path="/report-queue" element={<ReportQueuePage />} />
      <Route path="/inquiries" element={<InquiriesPage />} />
      <Route path="/messages" element={<MessagesPage />} />
      <Route path="/tools/emi-calculator" element={<EmiCalculatorPage />} />
      <Route path="/about" element={<InfoPage kind="about" />} />
      <Route path="/contact" element={<InfoPage kind="contact" />} />
      <Route path="/help" element={<InfoPage kind="help" />} />
      <Route path="/privacy" element={<InfoPage kind="privacy" />} />
      <Route path="/cookies" element={<InfoPage kind="cookies" />} />
      <Route path="/terms" element={<InfoPage kind="terms" />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    <SiteFooter />
    <CookieNotice />
  </MotionProvider>
}
