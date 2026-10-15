// The brand's own words. Portuguese only: this deployment is one person's, in pt-BR, and keeping
// these out of src/locales/ keeps the 18 upstream language packs (and check-locales) untouched.
export const COPY = {
  greeting(hour, name) {
    const part = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'
    return name ? `${part}, ${name}` : part
  },
  exercises: n => `${n} ${n === 1 ? 'exercício' : 'exercícios'}`,
  statWorkouts: 'treinos',
  statRecords: 'recordes',
  statBpm: 'BPM médio',
}
