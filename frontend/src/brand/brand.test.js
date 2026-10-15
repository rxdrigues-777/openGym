import { describe, expect, it } from 'vitest'
import { BRAND, lockedPrefs } from './brand.js'
import { COPY } from './copy.js'

describe('brand', () => {
  it('always resolves to the dark theme and the brand red, whatever the account saved', () => {
    expect(lockedPrefs('light', 'sky')).toEqual({ theme: 'dark', accent: '#FA0C17' })
    expect(lockedPrefs('system', '#00ff00')).toEqual({ theme: 'dark', accent: '#FA0C17' })
    expect(lockedPrefs(undefined, undefined)).toEqual({ theme: 'dark', accent: '#FA0C17' })
  })

  it('names the app and points at its logo', () => {
    expect(BRAND.name).toBe('Cadê o Shape')
    expect(BRAND.logo).toBe('/brand/logo.png')
  })

  it('greets by the time of day', () => {
    expect(COPY.greeting(7, 'Ronaldo')).toBe('Bom dia, Ronaldo')
    expect(COPY.greeting(14, 'Ronaldo')).toBe('Boa tarde, Ronaldo')
    expect(COPY.greeting(21, 'Ronaldo')).toBe('Boa noite, Ronaldo')
    expect(COPY.greeting(3, '')).toBe('Boa noite')
  })

  it('counts exercises in Portuguese', () => {
    expect(COPY.exercises(1)).toBe('1 exercício')
    expect(COPY.exercises(6)).toBe('6 exercícios')
  })
})

describe('settings search with the look locked', () => {
  it('no longer offers Theme or Accent color', async () => {
    const { searchSettings } = await import('../views/settings-pages.js')
    const ctx = { user: null, mobile: false, demo: false }
    expect(searchSettings('dark mode', ctx, s => s).map(h => h.title)).not.toContain('Theme')
    expect(searchSettings('accent', ctx, s => s).map(h => h.title)).not.toContain('Accent color')
  })
})
