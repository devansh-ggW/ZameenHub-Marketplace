import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Calculator, Info, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SectionKicker } from './components'

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

function money(value: number) {
  return inr.format(Number.isFinite(value) ? value : 0)
}

function percent(value: number, digits = 1) {
  return (value >= 0 ? '+' : '') + value.toFixed(digits) + '%'
}

function annualizedReturn(cashFlows: number[]): number | null {
  if (cashFlows.length < 2 || cashFlows.every(value => value >= 0) || cashFlows.every(value => value <= 0)) return null
  const netPresentValue = (rate: number) => cashFlows.reduce((total, cashFlow, period) => total + cashFlow / Math.pow(1 + rate, period), 0)
  let low = -0.99
  let high = 5
  let lowValue = netPresentValue(low)
  let highValue = netPresentValue(high)
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || lowValue * highValue > 0) return null
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const mid = (low + high) / 2
    const midValue = netPresentValue(mid)
    if (!Number.isFinite(midValue)) return null
    if (lowValue * midValue > 0) {
      low = mid
      lowValue = midValue
    } else {
      high = mid
      highValue = midValue
    }
  }
  const result = ((low + high) / 2) * 100
  return Number.isFinite(result) ? result : null
}

type NumericFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  help?: string
}

function NumericField({ id, label, value, onChange, min = 0, max = 1000000000, step = 1, placeholder, help }: NumericFieldProps) {
  return <div className="form-field">
    <label htmlFor={id}>{label}</label>
    <input className="form-control" id={id} type="number" min={min} max={max} step={step} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    {help ? <small>{help}</small> : null}
  </div>
}

export function InvestmentReturnsPage() {
  const [purchasePrice, setPurchasePrice] = useState('')
  const [growthRate, setGrowthRate] = useState('5')
  const [holdingYears, setHoldingYears] = useState('5')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [occupancy, setOccupancy] = useState('95')
  const [annualExpenses, setAnnualExpenses] = useState('0')
  const [purchaseCosts, setPurchaseCosts] = useState('7')
  const [sellingCosts, setSellingCosts] = useState('2')
  const [pastValue, setPastValue] = useState('')
  const [pastYears, setPastYears] = useState('5')

  const result = useMemo(() => {
    const price = Number(purchasePrice)
    const growth = Number(growthRate)
    const years = Number(holdingYears)
    const rent = monthlyRent.trim() === '' ? 0 : Number(monthlyRent)
    const occupied = Number(occupancy)
    const expenses = Number(annualExpenses)
    const acquisitionRate = Number(purchaseCosts)
    const saleRate = Number(sellingCosts)
    const historyPrice = pastValue.trim() === '' ? null : Number(pastValue)
    const historyYears = Number(pastYears)
    const valid = purchasePrice.trim() !== '' && Number.isFinite(price) && price > 0 && price <= 1000000000
      && growthRate.trim() !== '' && Number.isFinite(growth) && growth >= -25 && growth <= 30
      && holdingYears.trim() !== '' && Number.isInteger(years) && years >= 1 && years <= 40
      && Number.isFinite(rent) && rent >= 0 && rent <= 100000000
      && Number.isFinite(occupied) && occupied >= 0 && occupied <= 100
      && Number.isFinite(expenses) && expenses >= 0 && expenses <= 100000000
      && Number.isFinite(acquisitionRate) && acquisitionRate >= 0 && acquisitionRate <= 30
      && Number.isFinite(saleRate) && saleRate >= 0 && saleRate <= 20
      && (historyPrice === null || (Number.isFinite(historyPrice) && historyPrice > 0 && Number.isInteger(historyYears) && historyYears >= 1 && historyYears <= 80))
    if (!valid) return { valid: false, historicalGrowth: null, futureValue: 0, capitalGrowth: 0, totalNetRent: 0, annualNetRent: 0, initialOutlay: 0, saleProceeds: 0, profit: 0, totalReturn: 0, grossYield: 0, netYield: 0, annualized: null, holdingYears: 0, currentPrice: 0 }

    const futureValue = price * Math.pow(1 + growth / 100, years)
    const capitalGrowth = futureValue - price
    const initialOutlay = price * (1 + acquisitionRate / 100)
    const annualGrossRent = rent * 12 * occupied / 100
    const annualNetRent = annualGrossRent - expenses
    const totalNetRent = annualNetRent * years
    const saleProceeds = futureValue * (1 - saleRate / 100)
    const profit = saleProceeds + totalNetRent - initialOutlay
    const totalReturn = initialOutlay > 0 ? profit / initialOutlay * 100 : 0
    const grossYield = rent * 12 / price * 100
    const netYield = annualNetRent / initialOutlay * 100
    const cashFlows = [-initialOutlay]
    for (let year = 1; year <= years; year += 1) {
      cashFlows.push(annualNetRent + (year === years ? saleProceeds : 0))
    }
    const historicalGrowth = historyPrice !== null && historyYears >= 1 ? (Math.pow(price / historyPrice, 1 / historyYears) - 1) * 100 : null

    return { valid: true, historicalGrowth, futureValue, capitalGrowth, totalNetRent, annualNetRent, initialOutlay, saleProceeds, profit, totalReturn, grossYield, netYield, annualized: annualizedReturn(cashFlows), holdingYears: years, currentPrice: price }
  }, [purchasePrice, growthRate, holdingYears, monthlyRent, occupancy, annualExpenses, purchaseCosts, sellingCosts, pastValue, pastYears])

  const useHistoricalRate = () => {
    if (result.historicalGrowth === null) return
    const boundedRate = Math.max(-25, Math.min(30, result.historicalGrowth))
    setGrowthRate(boundedRate.toFixed(2))
  }

  return <main className="page-shell intelligence-page investment-returns-page">
    <div className="container">
      <div className="page-title">
        <SectionKicker>Property intelligence</SectionKicker>
        <h1>Model the <span className="serif">upside.</span></h1>
        <p>Estimate future property value, appreciation, rental cash flow and investment returns. Change the assumptions to compare scenarios before making a decision.</p>
      </div>

      <div className="tool-disclaimer">
        <Info size={18} />
        <p><strong>Scenario calculator, not a market forecast.</strong> Growth and rental figures are assumptions you supply. ZameenHub does not currently have a verified historical transaction-price series for every locality, so it will never fabricate one.</p>
      </div>

      <div className="growth-layout">
        <form className="form-card growth-inputs" onSubmit={event => event.preventDefault()}>
          <div className="emi-panel-title">
            <Calculator size={18} />
            <div><h2>Investment assumptions</h2><p>Enter your own figures; empty optional rent means no rental income.</p></div>
          </div>

          <NumericField id="growth-purchase-price" label="Purchase price / value today (₹)" value={purchasePrice} onChange={setPurchasePrice} min={1} max={1000000000} placeholder="e.g. 5000000" help="Use a price you have evidence for; this calculator does not verify it." />
          <div className="growth-field-pair">
            <NumericField id="growth-annual-rate" label="Expected annual price growth (%)" value={growthRate} onChange={setGrowthRate} min={-25} max={30} step={0.25} help="An editable scenario, not a prediction." />
            <NumericField id="growth-years" label="Years you plan to hold" value={holdingYears} onChange={setHoldingYears} min={1} max={40} step={1} help="Choose 1–40 years." />
          </div>
          <div className="growth-field-pair">
            <NumericField id="growth-monthly-rent" label="Expected monthly rent (₹)" value={monthlyRent} onChange={setMonthlyRent} min={0} max={100000000} placeholder="Optional" />
            <NumericField id="growth-occupancy" label="Expected occupied time (%)" value={occupancy} onChange={setOccupancy} min={0} max={100} step={1} help="Accounts for vacant months." />
          </div>
          <NumericField id="growth-expenses" label="Annual operating expenses (₹)" value={annualExpenses} onChange={setAnnualExpenses} min={0} max={100000000} help="Maintenance, property tax, insurance and similar costs; keep them in today's rupees." />
          <div className="growth-field-pair">
            <NumericField id="growth-purchase-costs" label="Purchase costs (%)" value={purchaseCosts} onChange={setPurchaseCosts} min={0} max={30} step={0.25} help="Stamp duty, registration and other one-time costs." />
            <NumericField id="growth-selling-costs" label="Selling costs (%)" value={sellingCosts} onChange={setSellingCosts} min={0} max={20} step={0.25} help="Estimated costs as a share of exit value." />
          </div>

          <details className="growth-history-inputs">
            <summary>Compare with a past value (optional)</summary>
            <p className="muted">Enter an earlier price or valuation that you have sourced. The resulting annualized growth is based only on your input and is not independently verified.</p>
            <NumericField id="growth-past-value" label="Earlier value (₹)" value={pastValue} onChange={setPastValue} min={1} max={1000000000} placeholder="Optional" />
            <NumericField id="growth-past-years" label="How many years ago?" value={pastYears} onChange={setPastYears} min={1} max={80} step={1} />
          </details>
          <button className="btn btn-outline" type="button" onClick={() => { setPurchasePrice(''); setGrowthRate('5'); setHoldingYears('5'); setMonthlyRent(''); setOccupancy('95'); setAnnualExpenses('0'); setPurchaseCosts('7'); setSellingCosts('2'); setPastValue(''); setPastYears('5') }}>Reset assumptions</button>
        </form>

        <section className="growth-result" aria-live="polite" aria-labelledby="growth-result-title">
          <SectionKicker>Projection summary</SectionKicker>
          <h2 id="growth-result-title">What could it be worth?</h2>
          {result.valid ? <>
            <p className="growth-main-value">{money(result.futureValue)}<span>estimated value after {result.holdingYears} {result.holdingYears === 1 ? 'year' : 'years'}</span></p>
            <div className="growth-value-compare">
              <div><span>Value today</span><strong>{money(result.currentPrice)}</strong></div>
              <div><span>Projected value</span><strong>{money(result.futureValue)}</strong></div>
              <div className="growth-value-bar" role="img" aria-label={'Projected property value compared with current value'}><span style={{ width: Math.max(0, Math.min(100, result.currentPrice / Math.max(result.currentPrice, result.futureValue) * 100)) + '%' }} /></div>
            </div>
            <div className="growth-metric"><span>Estimated capital appreciation</span><strong>{money(result.capitalGrowth)} <small>({percent(result.currentPrice ? result.capitalGrowth / result.currentPrice * 100 : 0)})</small></strong></div>
            <div className="growth-metric"><span>Net rental cash flow over holding period</span><strong>{money(result.totalNetRent)}</strong></div>
            <div className="growth-metric"><span>Estimated sale proceeds after selling costs</span><strong>{money(result.saleProceeds)}</strong></div>
            <div className="growth-metric"><span>Initial outlay including purchase costs</span><strong>{money(result.initialOutlay)}</strong></div>
            <div className="growth-profit"><span>Estimated total profit / (loss)</span><strong>{money(result.profit)}</strong><em>{percent(result.totalReturn)} total return on initial outlay</em></div>
            <div className="growth-yields">
              <div><span>Gross rental yield</span><strong>{result.grossYield.toFixed(2)}%</strong></div>
              <div><span>Net rental yield on initial outlay</span><strong>{result.netYield.toFixed(2)}%</strong></div>
              <div><span>Annualized return (estimated IRR)</span><strong>{result.annualized === null ? '—' : percent(result.annualized)}</strong></div>
            </div>
            {result.historicalGrowth !== null ? <div className="growth-history-result">
              <div><span>Annualized growth from your past-value inputs</span><strong>{percent(result.historicalGrowth)}</strong></div>
              <p>Based on the earlier value and time period you entered—not external market data.</p>
              {result.historicalGrowth >= -25 && result.historicalGrowth <= 30 ? <button className="btn btn-outline" type="button" onClick={useHistoricalRate}>Use past growth as a scenario</button> : <p className="muted">This historic rate falls outside the projection range of −25% to 30% per year, so it cannot be applied directly.</p>}
            </div> : null}
          </> : <div className="growth-empty">
            <TrendingUp size={24} />
            <h3>Enter a property value to start.</h3>
            <p>Results will update as you edit the assumptions. No property price or growth rate is pulled from invented sample data.</p>
          </div>}
          <p className="growth-disclaimer">This simplified model assumes the annual appreciation rate, rent, occupancy and operating expenses remain constant. It excludes loan interest/EMI, income tax, capital-gains tax, inflation and any renovation or unexpected costs not entered. The IRR is an estimate based on annual cash flows and the sale proceeds entered through these assumptions; it is not a guaranteed return or financial advice.</p>
          <Link className="btn btn-primary" to="/opportunities">Explore potential price gaps <ArrowUpRight size={15} /></Link>
        </section>
      </div>
      <div className="emi-back"><Link to="/tools/emi-calculator"><ArrowLeft size={15} /> Open home-loan EMI calculator</Link></div>
    </div>
  </main>
}
