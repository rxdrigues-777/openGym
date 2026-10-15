import { describe, it, expect } from 'vitest'
import { finishIntoState } from './finish-workout.js'

const T0 = Date.UTC(2026, 9, 15, 12, 0)
const base = (extra = {}) => ({
  routines: [], workouts: [], exWeights: {}, week: {}, dayPlan: {}, queue: null, rotation: null,
  bodyweight: [], customEx: [], ...extra,
})
const live = (sets, extra = {}) => ({
  id: 'a1', d: '2026-10-15', start: T0, routineIds: [], name: 'Teste', bw: null,
  entries: [{ id: '0025', sets, target: null }], ...extra,
})

describe('finishIntoState', () => {
  it('records a PR, advances exWeights, appends the workout with its volume and clears active', () => {
    const s = base({ active: {} })
    const active = live([{ w: 80, r: 5, done: true, at: T0 + 60000 }])
    const { w, prs } = finishIntoState(s, active, { now: T0 + 3600000, end: T0 + 1800000 })
    expect(prs).toEqual(['0025'])
    expect(s.exWeights['0025']).toEqual({ w: 80, d: '2026-10-15' })
    expect(s.workouts).toHaveLength(1)
    expect(s.workouts[0]).toBe(w)
    expect(w.vol).toBe(400)
    expect(w.end).toBe(T0 + 1800000)
    expect(w.prs).toEqual(['0025'])
    expect(s.active).toBeNull()
  })

  it('a lighter top set is no PR and leaves exWeights alone', () => {
    const s = base({
      exWeights: { '0025': { w: 100, d: '2026-10-01' } },
      workouts: [{ id: 'old', d: '2026-10-01', start: T0 - 14 * 864e5, end: T0 - 14 * 864e5 + 3600000,
        entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }], topW: 100 }], prs: ['0025'] }],
    })
    const { prs } = finishIntoState(s, live([{ w: 80, r: 5, done: true, at: T0 }]), { now: T0 + 3600000 })
    expect(prs).toEqual([])
    expect(s.exWeights['0025']).toEqual({ w: 100, d: '2026-10-01' })
    expect(s.workouts).toHaveLength(2)
  })

  it('a backfilled session is filed before a newer workout and stamped', () => {
    const newer = { id: 'new', d: '2026-10-16', start: T0 + 864e5, end: T0 + 864e5 + 3600000,
      entries: [{ id: '0047', sets: [{ w: 20, r: 10, done: true }], topW: 20 }], prs: [] }
    const s = base({ workouts: [newer] })
    const active = live([{ w: 80, r: 5, done: true, at: T0 }], { backfill: { durationMin: 45 } })
    const { w } = finishIntoState(s, active, { now: T0 + 2 * 864e5 })
    expect(s.workouts.map(x => x.id)).toEqual(['a1', 'new'])
    expect(w._ts).toBe(T0 + 2 * 864e5)
    expect(w.end).toBe(T0 + 45 * 60000)
    expect(s.exWeights).toEqual({})
  })

  it('sets left unchecked are kept on the record but a session with none done keeps no entry', () => {
    const s = base()
    const active = live([{ w: 80, r: 5, done: true, at: T0 }, { w: 80, r: 5, done: false }])
    active.entries.push({ id: '0047', sets: [{ w: 20, r: 10, done: false }], target: null })
    const { w } = finishIntoState(s, active, { now: T0 + 3600000 })
    expect(w.entries.map(e => e.id)).toEqual(['0025'])
  })
})
