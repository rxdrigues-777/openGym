// The two brand typefaces, bundled with the app so they work offline at the gym (OFL, @fontsource).
// Latin subset only: Portuguese needs nothing else, and the worker precaches every font file.
// Imported from JS by weight name: the package's exports map adds the .css itself ("./*" →
// "./*.css"), and a CSS @import of a package resolves relative to the stylesheet in this build.
import '@fontsource/barlow/latin-400'
import '@fontsource/barlow/latin-500'
import '@fontsource/barlow/latin-600'
import '@fontsource/barlow/latin-700'
import '@fontsource/big-shoulders-display/latin-700'
import '@fontsource/big-shoulders-display/latin-800'
import '@fontsource/big-shoulders-display/latin-900'
