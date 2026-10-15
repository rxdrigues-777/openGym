// Today's workout as the home's lead card (spec §5.3). It is the upstream today row, moved out of
// the week card and drawn large by brand.css: same words, same classes (.today-row .ttl .ss .tag),
// same tap — the coach-week tests read them — plus the exercise count under the name.
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'
import { DAYN } from '../lib/format.js'
import { COPY } from './copy.js'

export default function TodayHero({ hasPlan = true, active, editingSaved, activeName, doneToday, routine, todayName, todayOvr, next, exCount, onToday, onOther }) {
  // No routines yet: the welcome card below is the first thing to do, not a giant rest day.
  if (!hasPlan && !active && !doneToday) return null
  const title = active ? (editingSaved ? activeName : t('{0} (in progress)', activeName))
    : doneToday ? (doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done'))
    : routine ? todayName : t('Rest day')
  const state = active ? 'active' : doneToday ? 'done' : routine ? 'planned' : 'rest'
  return <div className={'card today-hero is-' + state}>
    <div className="today-row" {...tappable(onToday)}>
      <div className="row" style={{ gap: 9, minWidth: 0 }}>
        <span className="lrow-i hero-ic">
          <Icon name={active ? (editingSaved ? 'pencil' : 'play') : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="lbl2">{t('Today')}</div>
          <div className="ttl">{title}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
          {state === 'planned' && exCount > 0 && <div className="hero-meta">{COPY.exercises(exCount)}</div>}
          {next && !doneToday && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
        </div>
      </div>
      {active ? <span className="tag hero-go">{editingSaved ? t('Edit') : t('Resume')}</span>
        : doneToday ? <span className="tag hero-done">{t('Done')}</span>
        : routine ? <span className="tag acc hero-go">{t('Start')}</span>
        : <Icon name="plus" className="chev" />}
    </div>
    {!active && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
      <Button size="sm" variant="ghost" className="dim" icon="swap" onClick={onOther}>{t('Choose a different workout')}</Button>
    </div>}
  </div>
}
