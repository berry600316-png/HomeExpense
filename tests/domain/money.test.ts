import { describe, expect, it } from 'vitest'
import { formatMoney, formatNT, isValidAmount, parseAmount } from '../../src/domain/money'

describe('金額格式', () => {
  it('千分位與負號', () => {
    expect(formatNT(16700)).toBe('NT$16,700')
    expect(formatMoney(5280)).toBe('$5,280')
    expect(formatMoney(-720)).toBe('−$720')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(123456789)).toBe('$123,456,789')
  })
})

describe('金額輸入解析', () => {
  it('接受逗號、全形數字、空白', () => {
    expect(parseAmount('8,000')).toBe(8000)
    expect(parseAmount(' ８０００ ')).toBe(8000)
    expect(parseAmount('0')).toBe(0)
    expect(parseAmount('')).toBeNull()
  })
  it('拒絕小數、文字、負數（除非允許）', () => {
    expect(parseAmount('12.5')).toBeNaN()
    expect(parseAmount('abc')).toBeNaN()
    expect(parseAmount('-500')).toBeNaN()
    expect(parseAmount('-500', { allowNegative: true })).toBe(-500)
    expect(parseAmount('−500', { allowNegative: true })).toBe(-500)
    expect(parseAmount('-0', { allowNegative: true })).toBe(0)
    expect(Object.is(parseAmount('-0', { allowNegative: true }), -0)).toBe(false)
  })
  it('拒絕超大金額', () => {
    expect(parseAmount('99999999999')).toBeNaN()
  })
  it('isValidAmount', () => {
    expect(isValidAmount(100)).toBe(true)
    expect(isValidAmount(1.5)).toBe(false)
    expect(isValidAmount(-1)).toBe(false)
    expect(isValidAmount(-1, { allowNegative: true })).toBe(true)
    expect(isValidAmount('100')).toBe(false)
  })
})
