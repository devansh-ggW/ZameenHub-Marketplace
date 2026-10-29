import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { apiRequest, getSession, type AppUser } from './lib/auth'

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<AppUser | null>(null)
  const [busy, setBusy] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    setOpen(false)
    let active = true
    void getSession().then(result => { if (active) setUser(result.ok && result.data.authenticated ? result.data.user ?? null : null) })
    return () => { active = false }
  }, [location.pathname, location.search])

  async function logout() {
    setBusy(true)
    await apiRequest<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' })
    setBusy(false); setUser(null); navigate('/')
  }
  return <header className="site-header"><div className="container nav">
    <Link to="/" className="brand" aria-label="ZameenHub home"><img src="/assets/icon1.png" alt="" /><span>ZameenHub</span></Link>
    <nav className={'nav-links ' + (open ? 'open' : '')} aria-label="Primary navigation">
      <NavLink to="/">Home</NavLink>
      <NavLink to="/properties">Browse properties</NavLink>
      <NavLink to="/tools/emi-calculator">EMI calculator</NavLink>
      {user && <NavLink to="/saved">Saved properties</NavLink>}
      {user && <NavLink to="/my-listings">My listings</NavLink>}
      {user && <NavLink to="/inquiries">Inquiries</NavLink><NavLink to="/messages">Messages</NavLink>}
      {user && <NavLink to="/profile">Account</NavLink>}
      {user && ['admin','moderator'].includes(user.role) && <><NavLink to="/review-queue">Review queue</NavLink><NavLink to="/report-queue">Listing reports</NavLink></>}
      <NavLink to="/about">About</NavLink>
      {user ? <>
        <NavLink className="mobile-menu-link mobile-menu-list" to="/list-property">List a property <ArrowUpRight size={15} /></NavLink>
        <button className="mobile-menu-link mobile-menu-button" disabled={busy} onClick={() => void logout()}>{busy ? 'Signing out…' : 'Sign out'}</button>
      </> : <>
        <NavLink className="mobile-menu-link" to={'/login?next=' + encodeURIComponent(location.pathname === '/list-property' ? '/list-property' : '/profile')}>Sign in</NavLink>
        <NavLink className="mobile-menu-link" to="/signup">Create account</NavLink>
        <NavLink className="mobile-menu-link mobile-menu-list" to="/list-property">List a property <ArrowUpRight size={15} /></NavLink>
      </>}
    </nav>
    <div className="nav-actions">
      {user ? <><Link className="btn btn-outline nav-account" to="/profile">{user.name.split(' ')[0]}</Link><button className="btn btn-outline nav-signout" disabled={busy} onClick={() => void logout()}>{busy ? 'Signing out…' : 'Sign out'}</button></> : <><Link className="btn btn-outline nav-signin" to={'/login?next=' + encodeURIComponent(location.pathname === '/list-property' ? '/list-property' : '/profile')}>Sign in</Link><Link className="btn btn-primary nav-signup" to="/signup">Create account</Link></>}
      <Link className="btn btn-primary nav-list" to="/list-property">List a property <ArrowUpRight size={15} /></Link>
      <button className="icon-btn mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'}>{open ? <X size={18} /> : <Menu size={18} />}</button>
    </div>
  </div></header>
}

export function SiteFooter() {
  return <footer className="footer"><div className="container footer-grid">
    <div><Link to="/" className="brand"><img src="/assets/icon1.png" alt="" /><span>ZameenHub</span></Link><p style={{ maxWidth: 280, marginTop: 22 }}>A clearer way to find home. Published listings reflect marketplace review status; buyers and renters should independently verify information before a transaction.</p><p><strong>Customer support</strong><br /><a href="mailto:dewifystores@gmail.com">dewifystores@gmail.com</a></p></div>
    <div><h4>Explore</h4><Link to="/properties">Browse properties</Link><br /><Link to="/tools/emi-calculator">EMI calculator</Link><br /><Link to="/saved">Saved properties</Link><br /><Link to="/list-property">List a property</Link></div>
    <div><h4>Company</h4><Link to="/about">About</Link><br /><Link to="/contact">Contact support</Link><br /><Link to="/help">Help centre</Link></div>
    <div><h4>Legal</h4><Link to="/privacy">Privacy policy</Link><br /><Link to="/cookies">Cookie policy</Link><br /><Link to="/terms">Terms and conditions</Link></div>
  </div><div className="container footer-bottom"><span>© {new Date().getFullYear()} ZameenHub</span><span>Discover responsibly. Verify independently.</span></div></footer>
}
