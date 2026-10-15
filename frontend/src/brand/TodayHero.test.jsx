// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import TodayHero from './TodayHero.jsx'

let host, root
const render = props => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<TodayHero onToday={() => {}} onOther={() => {}} {...props} />))
}
afterEach(() => { act(() => root.unmount()); host.remove() })
const q = s => host.querySelector(s)

it('offers today\'s planned workout with its exercise count and Start', () => {
  render({ routine: { id: 'r1', name: 'Push Day' }, todayName: 'Push Day', exCount: 6 })
  expect(q('.today-row .ttl').textContent).toBe('Push Day')
  expect(q('.today-row .hero-meta').textContent).toBe('6 exercícios')
  expect(q('.today-row .tag').textContent).toBe('Start')
  expect(host.textContent).toContain('Choose a different workout')
})

it('takes a workout in progress back with Resume, and an edit with Edit', () => {
  render({ active: true, activeName: 'Push Day', routine: { id: 'r1', name: 'Push Day' }, todayName: 'Push Day', exCount: 6 })
  expect(q('.today-row .ttl').textContent).toBe('Push Day (in progress)')
  expect(q('.today-row .tag').textContent).toBe('Resume')
  expect(host.textContent).not.toContain('Choose a different workout')
  act(() => root.unmount()); host.remove()
  render({ active: true, editingSaved: true, activeName: 'Push Day' })
  expect(q('.today-row .tag').textContent).toBe('Edit')
})

it('says done once today\'s workout is logged', () => {
  render({ routine: { id: 'r1', name: 'Push Day' }, todayName: 'Push Day', doneToday: { name: 'Push Day' }, exCount: 6 })
  expect(q('.today-row .ttl').textContent).toBe('Push Day (done)')
  expect(q('.today-row .tag').textContent).toBe('Done')
  expect(q('.today-row .hero-meta')).toBeNull()
})

it('shows a rest day with the next session, and a plain rest day without one', () => {
  render({ next: { weekday: 5, routine: { name: 'Pull Day' } } })
  expect(q('.today-row .ttl').textContent).toBe('Rest day')
  expect(q('.today-row .ss').textContent).toMatch(/^Next session: \w+, Pull Day$/)
  act(() => root.unmount()); host.remove()
  render({})
  expect(q('.today-row .ttl').textContent).toBe('Rest day')
  expect(q('.today-row .ss')).toBeNull()
})

it('starts or resumes on a tap of the card, and opens the picker from the door', () => {
  const onToday = vi.fn(), onOther = vi.fn()
  render({ routine: { id: 'r1', name: 'A' }, todayName: 'A', exCount: 1, onToday, onOther })
  act(() => q('.today-row').click())
  expect(onToday).toHaveBeenCalledOnce()
  act(() => [...host.querySelectorAll('button')].find(b => b.textContent.includes('Choose a different workout')).click())
  expect(onOther).toHaveBeenCalledOnce()
})
