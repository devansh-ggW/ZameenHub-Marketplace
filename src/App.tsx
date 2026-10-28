import { Route, Routes } from 'react-router-dom'
import { MotionProvider, ScrollProgress } from './motion'
import { HomePage, PropertiesPage, PropertyDetailPage, NotFoundPage } from './pages'
import { AccountPage } from './account-pages'
import { AuthPage, VerifyEmailPage, ActivateAccountPage, ForgotPasswordPage, ResetPasswordPage } from './auth-pages'
import { InfoPage } from './legal-pages'
import { ListingPage } from './listing-page'
import { EditListingPage } from './edit-listing-page'
import { ReportQueuePage } from './report-queue'
import { InquiriesPage } from './inquiries-page'
import { EmiCalculatorPage } from './emi-calculator-page'
import { SiteFooter, SiteHeader } from './site-chrome'
import { CookieNotice } from './cookie-notice'

export default function App() {
  return <MotionProvider>
    <ScrollProgress />
    <SiteHeader />
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/properties" element={<PropertiesPage />} />
      <Route path="/properties/:slug" element={<PropertyDetailPage />} />
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
