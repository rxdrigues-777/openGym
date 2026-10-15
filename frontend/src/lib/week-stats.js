// The three numbers on the Cadê o Shape home (brand layer, spec 2026-10-15-etapa4 §5.4): this
// week's workouts against the plan, the records set in it, and the average heart rate of the
// ones logged on the watch. Same week as the strip above it: the profile's first weekday.
import { weekTally } from './queue.js'
import { weekStartOf, weekDayOffset, isoOf } from './format.js'

function weekRange(S, todayIso) {
  const today = new Date(todayIso + 'T12:00:00')
  const start = new Date(today)
  start.setDate(today.getDate() - weekDayOffset(today.getDay(), weekStartOf(S)))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return [isoOf(start), isoOf(end)]
}

export function weekStats(S, todayIso) {
  const [from, to] = weekRange(S, todayIso)
  const week = (S.workouts || []).filter(w => w && typeof w.d === 'string' && w.d >= from && w.d <= to)
  const prs = week.reduce((n, w) => n + (Array.isArray(w.prs) ? w.prs.length : 0), 0)
  const bpms = week.map(w => w.watch?.hr?.avg).filter(v => Number.isFinite(v) && v > 0)
  const { done, planned } = weekTally(S, todayIso)
  return {
    done: done || 0,
    planned: planned || 0,
    prs,
    bpmAvg: bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
  }
}
