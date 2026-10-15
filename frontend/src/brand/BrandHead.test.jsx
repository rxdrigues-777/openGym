// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import BrandHead from './BrandHead.jsx'

let host, root
afterEach(() => { act(() => root.unmount()); host.remove() })

it('shows the logo with the app name as its text and the tagline', () => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  act(() => root.render(<BrandHead />))
  const img = host.querySelector('img.brand-logo')
  expect(img.getAttribute('src')).toBe('/brand/logo.png')
  expect(img.getAttribute('alt')).toBe('Cadê o Shape')
  expect(host.querySelector('.brand-tagline').textContent).toBe('Treino no relógio, histórico no bolso.')
  expect(host.textContent).not.toContain('openGym')
})
