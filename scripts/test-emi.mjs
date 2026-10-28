import assert from 'node:assert/strict'
import { calculateEmi } from '../src/lib/emi.ts'

const zeroRate = calculateEmi(120_000, 0, 1)
assert.equal(zeroRate.months, 12)
assert.equal(zeroRate.emi, 10_000)
assert.equal(zeroRate.interest, 0)
assert.equal(zeroRate.total, 120_000)

const standard = calculateEmi(100_000, 12, 1)
assert.ok(Math.abs(standard.emi - 8884.878867834166) < 1e-6, '12% annual rate for one year should match the known EMI formula')
assert.ok(Math.abs(standard.total - standard.emi * 12) < 1e-8)
assert.ok(Math.abs(standard.interest - (standard.total - standard.principal)) < 1e-8)

const homeLoan = calculateEmi(4_000_000, 8.5, 20)
assert.ok(Math.abs(homeLoan.emi - 34712.92933462136) < 1e-6, 'sample home-loan EMI should match an independent formula calculation')
assert.ok(calculateEmi(4_000_000, 8.5, 30).emi < homeLoan.emi, 'longer terms should reduce monthly instalments')
assert.ok(calculateEmi(4_000_000, 8.5, 30).interest > homeLoan.interest, 'longer terms should raise total interest')

assert.throws(() => calculateEmi(0, 8.5, 20), RangeError)
assert.throws(() => calculateEmi(-1, 8.5, 20), RangeError)
assert.throws(() => calculateEmi(100_000, -1, 20), RangeError)
assert.throws(() => calculateEmi(100_000, 51, 20), RangeError)
assert.throws(() => calculateEmi(100_000, 8.5, 0), RangeError)
assert.throws(() => calculateEmi(100_000, 8.5, 20.5), RangeError)

console.log('EMI calculator tests passed.')
