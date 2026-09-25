import type { MaterialItem } from './material'

const SYSTEM = `You plan and write slide decks as HTML.

Compose content for the deterministic commitDrawerRequest tool. Follow its schema.

The title names the file the author will look for later, so make it what the
deck IS — never "Untitled" or "Deck".

Rules for the markup:
- One element per slide, carrying data-slide and a data-block naming its kind.
- The slide root fills the frame and lays its children out in flow:
  style="position: absolute; inset: 0; display: flex; flex-direction: column;
  justify-content: center; gap: 28px; padding: 72px 88px; box-sizing: border-box".
- NEVER POSITION A CHILD ABSOLUTELY, and never give one a fixed top or left.
  A headline that is two lines on your screen is three in the room, and a
  paragraph pinned at top: 270px is then underneath it — this is the single
  most common way a slide is ruined, and it cannot be fixed after the fact
  because scaling the slide preserves the overlap exactly. In flow, a long
  headline pushes what follows down instead of landing on top of it. Build
  every arrangement, including columns, from flex and grid with gap.
  One exception: a purely decorative layer — a gradient wash, a full-bleed
  image, or a card that sits behind everything — may be absolute. Mark it
  data-bg so it is understood to be the background rather than a collision.
- FILL THE FRAME. Content spans the full width between the margins, and the
  column stack fills the height. A narrow column of text in one corner of a
  1280×720 frame with dead space around it is the second most common failure.
  Two columns are a grid of equal fractions, never boxes placed by hand.
- Put the slide's headline in an <h1> and its second line in a <p>. The board
  reads those two elements to show and edit a slide's copy, so a slide built
  from unlabelled divs cannot be edited without rewriting it.
- Type is read from the back of a room. Headlines 54px and up; body, card and
  column text 24px and up; small labels never under 18px. Nothing on a slide
  is smaller than 18px — a 14px caption that reads fine on your screen is
  invisible on a projector.
- BUILDS: when a slide has parts that should arrive one at a time, give each
  part data-step="1", "2", … numbered from 1 with no gaps. Anything without
  data-step is on from the start. Use builds for lists and reveals; do not
  build a headline in — the room needs to know what it is looking at.
- data-notes on each slide stores what the presenter says, not visible copy.
  Use one or two sentences, or an empty attribute.
- No <script>, no network fonts. The ONLY images allowed are the attached
  files listed below, placed as <img src="assets/<file name>"> with the name
  copied exactly. A file marked [logo] belongs small on the title and end
  slides; a content image earns a slide when it carries the argument.

The LOOK is given to you below, and it governs every slide — one palette,
one type scale, one margin, used throughout. Never mix looks across a deck.`

/**
 * What each look asks for.
 *
 * `auto` is the default and the interesting one: it says "read the look off
 * what is attached" rather than naming a style, so a deck built from
 * someone's own screenshots and logo comes out looking like their work
 * without them choosing a theme. With nothing attached it falls back to
 * designing one consistent look — which is what a person would do too.
 */
const LOOKS: Record<string, string> = {
  auto: `LOOK — read it off the attached files. A design reference wins: read
its palette, type, weight and spacing and write every slide in that language.
Failing that, take the colours from a logo. With nothing to read, choose one
restrained look and hold it across the deck.`,
  ink: `LOOK — Ink: dark ground (near-black, not pure black), light type, high
contrast, one accent used sparingly. Generous margins.`,
  paper: `LOOK — Paper: light editorial. Warm off-white ground, near-black
type, a serif or high-contrast display face for headlines, plenty of air.`,
  signal: `LOOK — Signal: white ground, near-black type, one saturated accent
used for a single element per slide and nothing else.`,
}

const REFERENCE_RULE = `Every attached file is shown to you as an image, each named and marked with
its role. A file marked [reference] is a design reference, never content:
read its palette, type and spacing and never place it on a slide — its
filename is not an image source. Files marked [content] or [logo] are the
opposite: you SEE them so you can design with them, and you PLACE them with
<img src="assets/<file name>">. With no reference attached, read the look off
the content and logo images instead — their colours and character are what
the deck should feel like. If you can see no images at all, design one
consistent look of your own and say nothing about it either way.`

export interface ReferenceImage {
  name: string
  mimeType: string
  /** Base64, no data: prefix. */
  data: string
  /** What the file is for — steers how the drafter may use it. */
  role?: 'content' | 'reference' | 'logo'
}

export interface DraftedSlide {
  block: string
  notes: string
  html: string
}

function sliceJson(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open)
  const end = text.lastIndexOf(close)
  return start < 0 || end <= start ? null : text.slice(start, end + 1)
}

/**
 * Whole objects out of a broken document.
 *
 * Scans for balanced top-level braces, respecting strings and escapes so a
 * `}` inside a style attribute does not end an object early, and keeps the
 * ones that parse. Used only when the response as a whole will not.
 */
function salvageObjects(source: string): DraftedSlide[] {
  const out: DraftedSlide[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] !== '{') {
      i += 1
      continue
    }
    // Walk forward from this brace looking for its partner. The outer wrapper
    // is the one that got cut off, so it never balances and is skipped — and
    // the slide objects nested inside it are found on the next passes.
    let depth = 0
    let inString = false
    let escaped = false
    let end = -1
    for (let j = i; j < source.length; j += 1) {
      const ch = source[j]
      if (escaped) {
        escaped = false
        continue
      }
      if (inString && ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    if (end < 0) {
      i += 1
      continue
    }
    try {
      const entry = JSON.parse(source.slice(i, end + 1)) as DraftedSlide
      if (entry && typeof entry.html === 'string') {
        out.push({
          block: typeof entry.block === 'string' ? entry.block : '',
          notes: typeof entry.notes === 'string' ? entry.notes : '',
          html: entry.html,
        })
        i = end + 1
        continue
      }
    } catch {
      // A half-written object is simply not one of the whole ones.
    }
    i += 1
  }
  return out
}

export function parseDraft(text: string): {
  title: string
  slides: DraftedSlide[]
} {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  // Order matters: a bare array's FIRST brace belongs to its first entry, so
  // reaching for an object first slices one slide out of the array and reads
  // it as a whole draft with no slides in it.
  // A bare array must never fall back to slicing braces: the first brace
  // belongs to its first entry, so the fallback lifts one slide out and reads
  // it as a whole draft that happens to contain no slides. When the array has
  // no closing bracket it was truncated, and salvage is the right answer.
  const source = body.startsWith('[')
    ? sliceJson(body, '[', ']')
    : (sliceJson(body, '{', '}') ?? sliceJson(body, '[', ']'))
  if (!source) {
    const salvaged = salvageObjects(body)
    return { title: '', slides: salvaged }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    // A response cut off mid-slide is not worth nothing: the slides that
    // arrived whole before the cut still parse on their own. Salvage reads
    // the raw body, not the slice — the slice was cut at the last closing
    // brace, which in a truncated response can sit inside a style attribute
    // and lop the end off an object that was otherwise complete.
    const salvaged = salvageObjects(body)
    return salvaged.length ? { title: '', slides: salvaged } : { title: '', slides: [] }
  }
  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as { slides?: unknown })?.slides ?? [])
  const title = Array.isArray(parsed)
    ? ''
    : String((parsed as { title?: unknown })?.title ?? '').trim()
  if (!Array.isArray(list)) return { title, slides: [] }
  const slides = list
    .filter(
      (entry): entry is DraftedSlide =>
        !!entry &&
        typeof (entry as DraftedSlide).html === 'string' &&
        /^\s*<[a-z]/i.test((entry as DraftedSlide).html),
    )
    .map(entry => ({
      block: typeof entry.block === 'string' ? entry.block : '',
      notes: typeof entry.notes === 'string' ? entry.notes : '',
      html: entry.html,
    }))
  return { title: title.slice(0, 80), slides }
}

function inventoryOf(material: MaterialItem[]): string {
  const usable = material.filter(item => item.role !== 'reference')
  if (!usable.length) return '(nothing attached)'
  return usable
    .map(item => {
      const role = item.role && item.role !== 'content' ? ` [${item.role}]` : ''
      const shows = item.description.trim()
      return `- ${item.reference}${role}${shows ? ` — ${shows}` : ''}`
    })
    .join('\n')
}

export function deckDesignGuide(look='auto'):string {
  return `Compose the complete deck HTML for commitDrawerRequest, not the example JSON response shape.\n${SYSTEM}\n${LOOKS[look]??LOOKS.auto}\n${REFERENCE_RULE}\nReturn complete deck HTML to commitDrawerRequest, preserving existing content unless replacement was requested.`
}
