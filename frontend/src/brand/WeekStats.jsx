// This week in three numbers under today's card (spec §5.4), each with its plate-colour bar.
import { COPY } from './copy.js'

export default function WeekStats({ stats }) {
  const { done, planned, prs, bpmAvg } = stats
  const cells = [
    { v: planned ? `${done}/${planned}` : `${done}`, label: COPY.statWorkouts, cls: 'ws-go' },
    { v: `${prs}`, label: COPY.statRecords, cls: 'ws-pr' },
    { v: bpmAvg == null ? '--' : `${bpmAvg}`, label: COPY.statBpm, cls: 'ws-hr' },
  ]
  return <div className="week-stats">
    {cells.map(c => <div key={c.cls} className={'wstat ' + c.cls}><b>{c.v}</b><span>{c.label}</span><i /></div>)}
  </div>
}
