import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Calculator } from 'lucide-react'
import { SectionKicker } from './components'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

function money(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0)
}

export function EmiCalculatorPage() {
  const [price, setPrice] = useState('5000000')
  const [downPayment, setDownPayment] = useState('1000000')
  const [annualRate, setAnnualRate] = useState('8.5')
  const [years, setYears] = useState('20')

  const result = useMemo(() => {
    const homePrice = Number(price)
    const down = Number(downPayment)
    const rate = Number(annualRate)
    const term = Number(years)
    const valid = price.trim() !== '' && Number.isFinite(homePrice) && homePrice > 0 && homePrice <= 1_000_000_000
      && downPayment.trim() !== '' && Number.isFinite(down) && down >= 0 && down < homePrice
      && annualRate.trim() !== '' && Number.isFinite(rate) && rate >= 0 && rate <= 50
      && years.trim() !== '' && Number.isFinite(term) && Number.isInteger(term) && term >= 1 && term <= 40
    if (!valid) return { valid: false, principal: 0, emi: 0, total: 0, interest: 0, months: 0 }
    const principal = homePrice - down
    const months = term * 12
    const monthlyRate = rate / 1200
    const factor = monthlyRate === 0 ? 1 : Math.pow(1 + monthlyRate, months)
    const emi = monthlyRate === 0 ? principal / months : principal * monthlyRate * factor / (factor - 1)
    const total = emi * months
    return { valid: true, principal, emi, total, interest: Math.max(0, total - principal), months }
  }, [price, downPayment, annualRate, years])

  return <main className="page-shell emi-page"><div className="container">
    <div className="page-title"><SectionKicker>Buyer tools</SectionKicker><h1>Know the monthly<br /><span className="serif">commitment.</span></h1><p>Estimate a home-loan EMI from the property price, down payment, interest rate and loan term—before you make a decision.</p></div>
    <div className="emi-layout">
      <form className="form-card emi-inputs" onSubmit={event => event.preventDefault()}>
        <div className="emi-panel-title"><Calculator size={18} /><div><h2>Loan assumptions</h2><p>Editable sample values—not a lender quote.</p></div></div>
        <div className="form-field"><label htmlFor="emi-price">Property price (₹)</label><input className="form-control" id="emi-price" type="number" min="1" max="1000000000" step="1" value={price} onChange={event => setPrice(event.target.value)} required /></div>
        <div className="form-field"><label htmlFor="emi-down-payment">Down payment (₹)</label><input className="form-control" id="emi-down-payment" type="number" min="0" max="1000000000" step="1" value={downPayment} onChange={event => setDownPayment(event.target.value)} required /><small>Loan amount is property price minus this payment.</small></div>
        <div className="form-field"><label htmlFor="emi-rate">Annual interest rate (%)</label><input className="form-control" id="emi-rate" type="number" min="0" max="50" step="0.05" value={annualRate} onChange={event => setAnnualRate(event.target.value)} required /></div>
        <div className="form-field"><label htmlFor="emi-years">Loan term (years)</label><select className="form-control" id="emi-years" value={years} onChange={event => setYears(event.target.value)}>{Array.from({ length: 40 }, (_, index) => index + 1).map(term => <option key={term} value={term}>{term} {term === 1 ? 'year' : 'years'}</option>)}</select></div>
        <button className="btn btn-outline" type="button" onClick={() => { setPrice('5000000'); setDownPayment('1000000'); setAnnualRate('8.5'); setYears('20') }}>Reset sample values</button>
      </form>
      <section className="emi-result" aria-live="polite" aria-labelledby="emi-result-title">
        <SectionKicker>Estimated repayment</SectionKicker><h2 id="emi-result-title">Your monthly EMI.</h2>
        {result.valid ? <>
          <p className="emi-main-value">{money(result.emi)}<span>/ month</span></p>
          <div className="emi-metric"><span>Loan principal</span><strong>{money(result.principal)}</strong></div>
          <div className="emi-metric"><span>Total interest over {result.months} months</span><strong>{money(result.interest)}</strong></div>
          <div className="emi-metric"><span>Total repayments</span><strong>{money(result.total)}</strong></div>
          <div className="emi-bar" role="img" aria-label={`Principal ${Math.round(result.principal / result.total * 100)} percent, interest ${Math.round(result.interest / result.total * 100)} percent`}><span style={{ width: `${result.principal / result.total * 100}%` }} /><span style={{ width: `${result.interest / result.total * 100}%` }} /></div>
          <div className="emi-legend"><span><i className="emi-legend-principal" />Principal</span><span><i className="emi-legend-interest" />Interest</span></div>
        </> : <p className="status-message error" role="alert">Enter a valid property price, a down payment below the price, an interest rate from 0–50%, and a loan term from 1–40 years.</p>}
        <p className="emi-disclaimer">This is an estimate using a standard reducing-balance monthly repayment formula. Actual lender rates, fees, insurance, taxes, rate changes and eligibility can change the amount. It is not financial advice or a loan approval.</p>
        <Link className="btn btn-primary" to="/properties">Browse published properties <ArrowUpRight size={15} /></Link>
      </section>
    </div>
    <div className="emi-back"><Link to="/"><ArrowLeft size={15} /> Back to home</Link></div>
  </div></main>
}
