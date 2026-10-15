// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import WeekStats from './WeekStats.jsx'

let host, root
afterEach(() => { act(() => root.unmount()); host.remove() })
const render = stats => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<WeekStats stats={stats} />))
}
const values = () => [...host.querySelectorAll('.wstat b')].map(b => b.textContent)

it('shows the week\'s workouts against the plan, records and average heart rate', () => {
  render({ done: 2, planned: 4, prs: 3, bpmAvg: 131 })
  expect(values()).toEqual(['2/4', '3', '131'])
  expect(host.textContent).toContain('treinos')
  expect(host.textContent).toContain('BPM médio')
})

it('shows -- without watch heart rate and the bare count without a plan', () => {
  render({ done: 1, planned: 0, prs: 0, bpmAvg: null })
  expect(values()).toEqual(['1', '0', '--'])
})
