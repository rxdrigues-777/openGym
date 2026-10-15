// Cadê o Shape — this fork's name and look (spec docs/superpowers/specs/2026-10-15-etapa4-pwa-
// visual-design.md). Kept in one place so the few upstream files that show the brand read it
// here and otherwise keep their shape (FORK.md). index.css stays as upstream ships it; the look
// itself is brand.css, loaded after it.
export const BRAND = {
  name: 'Cadê o Shape',
  tagline: 'Treino no relógio, histórico no bolso.',
  logo: '/brand/logo.png',
  icon: '/brand/icone.png',
  accent: '#FA0C17',
  // The look is the brand's: always dark, always the brand red. The account's saved theme and
  // accent stay in the state (they sync as before); they just do not apply.
  lockedLook: true,
}

export function lockedPrefs(theme, accent) {
  return BRAND.lockedLook ? { theme: 'dark', accent: BRAND.accent } : { theme, accent }
}
