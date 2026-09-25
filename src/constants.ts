/** Must match `plugin.json` `app.slug`. */
export const DECK_APP_SLUG = 'slides'

/** Canonical document: a `.deck` package folder. */
export const DECK_PACKAGE_SUFFIX = '.deck'

/**
 * The deck document inside a `.deck` package.
 *
 * One HTML file holds every slide, the way PureVideo holds every scene: the
 * board is a view OF this markup, never a parallel model that can drift from
 * it. Named `index.html` so the package folder opens in a browser as-is.
 */
export const DECK_FILE = 'index.html'

/** Package manifest — title, brief and asset notes. Geometry lives in the HTML. */
export const DECK_MANIFEST_FILE = 'manifest.json'

/** Package assets folder (kept even while empty so the folder shape is stable). */
export const DECK_ASSETS_DIR = 'assets'

/** Where exported PDFs, image sets and videos land inside the package. */
export const DECK_EXPORT_DIR = 'exports'

/**
 * The one accent, everywhere in the UI.
 *
 * The platform injects `--app-acc` per app slug; gold 84 is the hue slides
 * is registered under, so standalone dev shows the same colour the shell
 * does. Interpolate this constant into styled-components — never a local
 * accent var.
 */
export const ACCENT = 'var(--app-acc, oklch(0.55 0.125 84))'

/** Debounced autosave delay for `.deck` packages. */
export const AUTOSAVE_DELAY_MS = 600

/**
 * Defaults for a new deck.
 *
 * 1280×720 rather than 1920×1080: a deck is authored at the size it is
 * TYPED at, and 16:9 at this scale keeps body type honest — 24px here is
 * 24px on the projector, so a slide that looks crowded is crowded.
 */
export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 720
export const DEFAULT_DECK_ID = 'deck'

/** How many slides the wizard aims for when nobody says otherwise. */
export const DEFAULT_SLIDE_COUNT = 8

/** Where the deck's look comes from when nobody picks one. */
export const DEFAULT_LOOK = 'auto'

/** Seconds a slide holds in a timed export when nothing says otherwise. */
export const DEFAULT_SLIDE_SECONDS = 5

/** Frames per second for the video export (the only place time appears). */
export const EXPORT_FPS = 30

/** Exporting more than this many frames in one pass is refused. */
export const MAX_EXPORT_FRAMES = 1800
