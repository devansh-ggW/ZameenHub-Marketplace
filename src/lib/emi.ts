export type EmiEstimate = {
  principal: number
  months: number
  emi: number
  total: number
  interest: number
}

/**
 * Estimate a fixed-rate, reducing-balance monthly EMI.
 * This is a calculation only; it does not predict lender fees or rate changes.
 */
export function calculateEmi(principal: number, annualRatePercent: number, termYears: number): EmiEstimate {
  if (!Number.isFinite(principal) || principal <= 0) throw new RangeError('Principal must be positive')
  if (!Number.isFinite(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > 50) throw new RangeError('Annual rate must be between 0 and 50 percent')
  if (!Number.isInteger(termYears) || termYears < 1 || termYears > 40) throw new RangeError('Term must be an integer from 1 to 40 years')
  const months = termYears * 12
  const monthlyRate = annualRatePercent / 1200
  const growth = monthlyRate === 0 ? 1 : Math.pow(1 + monthlyRate, months)
  const emi = monthlyRate === 0 ? principal / months : principal * monthlyRate * growth / (growth - 1)
  const total = emi * months
  return { principal, months, emi, total, interest: Math.max(0, total - principal) }
}
