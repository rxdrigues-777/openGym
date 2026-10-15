import { describe, expect, it } from 'vitest'
import { weekStats } from './week-stats.js'

// 2026-10-15 is a Thursday. With the week starting on Monday it runs 10-12 … 10-18.
const base = over => ({ workouts: [], routines: [], dayPlan: {}, weekStart: 1, ...over })
const w = (d, extra = {}) => ({ id: d + Math.random(), d, start: Date.parse(d + 'T10:00:00'), prs: [], entries: [], ...extra })

describe('weekStats', () => {
  it('is all zeros and no heart rate for an empty profile', () => {
    expect(weekStats(base(), '2026-10-15')).toEqual({ done: 0, planned: 0, prs: 0, bpmAvg: null })
  })

  it('adds up the records of this week only', () => {
    const S = base({ workouts: [w('2026-10-11', { prs: ['a'] }), w('2026-10-12', { prs: ['a', 'b'] }), w('2026-10-15', { prs: ['c'] }), w('2026-10-19', { prs: ['d'] })] })
    expect(weekStats(S, '2026-10-15').prs).toBe(3)
  })

  it('averages the heart rate of this week\'s watch workouts and skips the rest', () => {
    const S = base({ workouts: [
      w('2026-10-13', { watch: { hr: { avg: 120 } } }),
      w('2026-10-14', { watch: { hr: { avg: 141 } } }),
      w('2026-10-14', { watch: { clientId: 'x' } }),
      w('2026-10-15', { watch: { hr: { avg: 'nope' } } }),
      w('2026-10-15'),
      w('2026-10-09', { watch: { hr: { avg: 200 } } }),
    ] })
    expect(weekStats(S, '2026-10-15').bpmAvg).toBe(131)
  })

  it('shows no heart rate when no workout this week came from the watch', () => {
    expect(weekStats(base({ workouts: [w('2026-10-15')] }), '2026-10-15').bpmAvg).toBeNull()
  })

  it('follows a week that starts on Sunday', () => {
    const S = base({ weekStart: 0, workouts: [w('2026-10-11', { prs: ['a'] }), w('2026-10-12', { prs: ['b'] }), w('2026-10-18', { prs: ['c'] })] })
    expect(weekStats(S, '2026-10-15').prs).toBe(2) // 10-11 … 10-17
  })

  it('takes done and planned from the same tally the streak card shows', () => {
    const S = base({ workouts: [w('2026-10-13'), w('2026-10-14')] })
    const r = weekStats(S, '2026-10-15')
    expect(r.done).toBe(2)
    expect(typeof r.planned).toBe('number')
  })
})
