// The sign-in and first-run heading: the brand's logo in place of the upstream dumbbell and
// "openGym" title. Its alt text carries the name for screen readers.
import { BRAND } from './brand.js'

export default function BrandHead() {
  return <div className="brand-head">
    <img className="brand-logo" src={BRAND.logo} alt={BRAND.name} width="180" />
    <div className="brand-tagline">{BRAND.tagline}</div>
  </div>
}
