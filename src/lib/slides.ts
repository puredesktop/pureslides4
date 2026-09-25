/**
 * Slides.
 *
 * A slide is a DIRECT child of the deck root carrying `data-slide`. The deck
 * document holds every slide, and the board is a VIEW of that markup — there
 * is no second model that can drift from it. Every operation here rewrites
 * the document, the way PureVideo's storyboard rewrites its composition.
 *
 * Slides are ORDERED, not timed. This is the one place a deck genuinely
 * differs from a video: PureVideo's scenes are sequential in seconds and a
 * move rewrites every start after it, whereas slides advance when a person
 * presses a key. Time only appears when a deck is exported as video, and it
 * is derived then rather than stored — so "move this slide" is a reorder and
 * nothing else has to be recomputed.
 *
 * BUILDS are the exception that keeps the dynamic part. A descendant carrying
 * `data-step="N"` (N ≥ 1) arrives on the Nth press; anything without one is
 * on from the start. That is a property of the markup, seekable the same way
 * PureVideo freezes a frame, which is what lets one model serve the board's
 * preview, presenting, PDF (every step revealed) and video (steps on a clock).
 */
import { DEFAULT_SLIDE_SECONDS } from '../constants'

export interface Slide {
  /** Position in the strip, and the handle every operation takes. */
  index: number
  /**
   * True when the deck has no child slides and the root itself is standing in
   * as one — a document someone wrote by hand, or an imported page. Its copy
   * is editable; reordering has nothing to reorder.
   */
  synthetic?: boolean
  /** First heading-ish line, shown on the card. */
  headline: string
  /** Second line, when the slide has one. */
  support: string
  /** Speaker notes — presenter view only, never on the slide. */
  notes: string
  /** `data-block`, when the slide declares what kind it is. */
  block: string
  /** Relative path of the image this slide shows, when it shows one. */
  asset: string
  /** How many build steps it has beyond the always-on state. */
  steps: number
  /** Seconds it holds in a timed export. */
  seconds: number
}

const SLIDE_SELECTOR = '[data-slide]'

function parse(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null
  return new DOMParser().parseFromString(html, 'text/html')
}

function rootOf(doc: Document): Element | null {
  return doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
}

/** Direct children only — a nested element is content, not a slide. */
function slideElements(doc: Document): Element[] {
  const root = rootOf(doc)
  if (!root) return []
  return [...root.children].filter(child => child.matches(SLIDE_SELECTOR))
}

function textOf(element: Element | null): string {
  return (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Text a person would recognise, for a card label.
 *
 * Not textContent: a slide carries its own <style>, and textContent also
 * butts adjacent blocks together so a headline and the line under it come
 * back as one run-on word. Tags become spaces; style and script go first.
 */
function readableText(element: Element): string {
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('style, script, [data-notes]').forEach(node => {
    node.remove()
  })
  return clone.innerHTML
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The highest `data-step` inside a slide — how many presses it takes. */
export function stepsIn(element: Element): number {
  let highest = 0
  element.querySelectorAll('[data-step]').forEach(node => {
    const step = Number(node.getAttribute('data-step'))
    if (Number.isFinite(step) && step > highest) highest = Math.floor(step)
  })
  return highest
}

function readSlide(element: Element, index: number): Slide {
  const heading = element.querySelector('h1, h2, h3, [data-headline]')
  const support = element.querySelector('[data-support], p, .subtitle')
  const image = element.querySelector('img[src]')
  const notes = element.querySelector('[data-notes]')
  const seconds = Number(element.getAttribute('data-seconds'))
  return {
    index,
    headline: textOf(heading) || readableText(element).slice(0, 60),
    support: heading ? textOf(support) : '',
    notes: textOf(notes),
    block: element.getAttribute('data-block') ?? '',
    asset: image?.getAttribute('src') ?? element.querySelector('video')?.getAttribute('src') ?? '',
    steps: stepsIn(element),
    seconds:
      Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_SLIDE_SECONDS,
  }
}

export function slidesFromHtml(html: string): Slide[] {
  const doc = parse(html)
  if (!doc) return []
  const elements = slideElements(doc)

  if (!elements.length) {
    // No child slides: if the root has content, show it as one slide rather
    // than claiming the deck is empty. An EMPTY root is not a slide —
    // otherwise a cleared deck reports one and the next add wraps nothing.
    const root = rootOf(doc)
    if (!root || !root.children.length) return []
    return [{ ...readSlide(root, 0), synthetic: true }]
  }

  return elements.map((element, index) => readSlide(element, index))
}

/**
 * The element a slide index names.
 *
 * A deck whose root IS the slide has no child slides, and slide 0 is the root
 * itself — the way `slidesFromHtml` reports it. Reaching for `children[0]`
 * there addresses the first thing INSIDE the slide, so every path is off by a
 * level and lands on the wrong element or nothing at all.
 */
export function slideElementAt(root: Element, index: number): Element | null {
  const children = [...root.children].filter(child =>
    child.matches(SLIDE_SELECTOR),
  )
  if (!children.length) return index === 0 && root.children.length ? root : null
  return children[index] ?? null
}

function serialize(doc: Document): string {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}\n`
}

/**
 * Wrap a rootful deck into a real slide before it gains a sibling.
 *
 * Someone's hand-written page reports as one synthetic slide; adding a second
 * has to make the first a slide in its own right, or the new one becomes a
 * sibling of its CONTENT and the deck reads as one broken slide.
 */
function ensureSlides(doc: Document): Element | null {
  const root = rootOf(doc)
  if (!root) return null
  if ([...root.children].some(child => child.matches(SLIDE_SELECTOR))) {
    return root
  }
  if (!root.children.length) return root
  const wrapper = doc.createElement('div')
  wrapper.setAttribute('data-slide', '')
  while (root.firstChild) wrapper.appendChild(root.firstChild)
  root.appendChild(wrapper)
  return root
}

export function addSlide(
  html: string,
  slideHtml: string,
  atIndex?: number,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = ensureSlides(doc)
  if (!root) return html
  const holder = doc.createElement('div')
  holder.innerHTML = slideHtml
  const next = holder.firstElementChild
  if (!next) return html
  if (!next.hasAttribute('data-slide')) next.setAttribute('data-slide', '')

  const slides = [...root.children].filter(child =>
    child.matches(SLIDE_SELECTOR),
  )
  const at = atIndex === undefined ? slides.length : atIndex
  const before = slides[at]
  if (before) root.insertBefore(next, before)
  else root.appendChild(next)
  return serialize(doc)
}

export function moveSlide(html: string, from: number, to: number): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slides = [...root.children].filter(child =>
    child.matches(SLIDE_SELECTOR),
  )
  const moving = slides[from]
  if (!moving || to < 0 || to >= slides.length || from === to) return html
  const rest = slides.filter((_slide, index) => index !== from)
  const before = rest[to]
  if (before) root.insertBefore(moving, before)
  else root.appendChild(moving)
  return serialize(doc)
}

export function duplicateSlide(html: string, index: number): string {
  const doc = parse(html)
  if (!doc) return html
  const root = ensureSlides(doc)
  if (!root) return html
  const slides = [...root.children].filter(child =>
    child.matches(SLIDE_SELECTOR),
  )
  const source = slides[index]
  if (!source) return html
  const copy = source.cloneNode(true) as Element
  source.after(copy)
  return serialize(doc)
}

/** Refuses the last slide: a deck with no slides is not a deck. */
export function deleteSlide(html: string, index: number): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slides = [...root.children].filter(child =>
    child.matches(SLIDE_SELECTOR),
  )
  if (slides.length <= 1) return html
  const target = slides[index]
  if (!target) return html
  target.remove()
  return serialize(doc)
}

export interface SlideEdit {
  headline?: string
  support?: string
  notes?: string
  block?: string
  asset?: string
  seconds?: number
}

export function setSlideContent(
  html: string,
  index: number,
  patch: SlideEdit,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html

  if (patch.headline !== undefined) {
    const heading = slide.querySelector('h1, h2, h3, [data-headline]')
    if (heading) heading.textContent = patch.headline
  }
  if (patch.support !== undefined) {
    const support = slide.querySelector('[data-support], p, .subtitle')
    if (support) support.textContent = patch.support
  }
  if (patch.notes !== undefined) {
    // Notes live IN the slide so they travel with it — moved, duplicated,
    // exported — but they are marked hidden so no renderer ever paints them.
    let notes = slide.querySelector('[data-notes]')
    if (!patch.notes.trim()) {
      notes?.remove()
    } else {
      if (!notes) {
        notes = doc.createElement('div')
        notes.setAttribute('data-notes', '')
        notes.setAttribute('hidden', '')
        notes.setAttribute('style', 'display: none')
        slide.appendChild(notes)
      }
      notes.textContent = patch.notes
    }
  }
  if (patch.block !== undefined) slide.setAttribute('data-block', patch.block)
  if (patch.asset !== undefined) {
    const image = slide.querySelector('img[src]')
    if (image) image.setAttribute('src', patch.asset)
    else {
      // A video slide: the clip goes into the slot and its cover goes.
      const video = slide.querySelector('video')
      if (video) {
        video.setAttribute('src', patch.asset)
        slide.querySelectorAll('[data-video-empty]').forEach(node => node.remove())
      }
    }
  }
  if (patch.seconds !== undefined && patch.seconds > 0) {
    slide.setAttribute('data-seconds', String(patch.seconds))
  }
  return serialize(doc)
}

/**
 * Follow a chain of child indexes from a slide — "0.2" is the third child of
 * the first child. Deliberately positional rather than a CSS selector: slides
 * are written by a model and rarely carry stable ids or classes.
 */
export function elementAtPath(slide: Element, path: string): Element | null {
  if (!path) return slide
  let element: Element | null = slide
  for (const part of path.split('.')) {
    const index = Number(part)
    if (!Number.isInteger(index) || index < 0) return null
    element = element?.children[index] ?? null
    if (!element) return null
  }
  return element
}

/** Replace one element inside one slide, leaving the rest of the deck alone. */
export function setSlideElement(
  html: string,
  index: number,
  path: string,
  elementHtml: string,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html
  const target = elementAtPath(slide, path)
  if (!target || target === slide) return html
  const holder = doc.createElement('div')
  holder.innerHTML = elementHtml
  const next = holder.firstElementChild
  if (!next) return html
  target.replaceWith(next)
  return serialize(doc)
}

/**
 * Remove one element from one slide.
 *
 * Refuses an empty path: that addresses the slide itself, and removing a
 * slide is `deleteSlide`'s job — which also refuses to empty the deck.
 */
export function deleteSlideElement(
  html: string,
  index: number,
  path: string,
): string {
  if (!path) return html
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html
  const target = elementAtPath(slide, path)
  if (!target || target === slide) return html
  target.remove()
  return serialize(doc)
}

/**
 * Put an element on a build step — the control behind "make this arrive on
 * the second press". Step 0 clears it: the element is on from the start.
 */
export function setElementStep(
  html: string,
  index: number,
  path: string,
  step: number,
): string {
  if (!path) return html
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html
  const target = elementAtPath(slide, path)
  if (!target || target === slide) return html
  if (step <= 0) target.removeAttribute('data-step')
  else target.setAttribute('data-step', String(Math.floor(step)))
  return serialize(doc)
}

/**
 * What to call the element at a path — the same text the preview puts on its
 * badge, so a selection made by the drawer agent reads like one made by hand.
 */
export function labelForPath(
  html: string,
  index: number,
  path: string,
): string {
  const doc = parse(html)
  const root = doc ? rootOf(doc) : null
  const slide = root ? slideElementAt(root, index) : null
  const element = slide ? elementAtPath(slide, path) : null
  if (!element) return path
  const text = readableText(element)
  if (text) return text.length > 40 ? `${text.slice(0, 38)}…` : text
  return element.tagName.toLowerCase()
}

/** True while the deck still holds only the starter slide nobody wrote. */
export function isUntouchedStarter(html: string): boolean {
  const slides = slidesFromHtml(html)
  return slides.length === 1 && slides[0].block === 'starter'
}

/** Empty the deck of slides, keeping the root and its head. */
export function clearSlides(html: string): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  ;[...root.children]
    .filter(child => child.matches(SLIDE_SELECTOR))
    .forEach(child => child.remove())
  return serialize(doc)
}

export interface PickedElementInfo {
  tag: string
  /** Editable text, when the element is a leaf of words. */
  text: string
  /** `src`, when it is an image. */
  src: string
  /** True when its content is text and nothing else — safe to edit as text. */
  editableText: boolean
  isImage: boolean
  /** The build step it arrives on; 0 means on from the start. */
  step: number
}

/**
 * What a picked element IS, so the rail can offer the right control.
 *
 * `editableText` is the careful part: an element is only safe to edit as text
 * when its content is text and nothing else. Writing a string into a div that
 * also holds three children would delete them — so a container gets no text
 * box, and the ask box handles it instead.
 */
export function readElement(
  html: string,
  index: number,
  path: string,
): PickedElementInfo | null {
  const doc = parse(html)
  const root = doc ? rootOf(doc) : null
  const slide = root ? slideElementAt(root, index) : null
  const element = slide ? elementAtPath(slide, path) : null
  if (!element) return null
  const step = Number(element.getAttribute('data-step'))
  const isImage = element.tagName === 'IMG'
  return {
    tag: element.tagName.toLowerCase(),
    text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
    src: isImage ? (element.getAttribute('src') ?? '') : '',
    // No element children, and it is not a void element pretending to be text.
    editableText: !isImage && element.children.length === 0,
    isImage,
    step: Number.isFinite(step) && step > 0 ? Math.floor(step) : 0,
  }
}

/** Replace one element's words, leaving its markup and styling alone. */
export function setElementText(
  html: string,
  index: number,
  path: string,
  text: string,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html
  const element = elementAtPath(slide, path)
  if (!element || element === slide) return html
  // Refuse a container: writing text into it would delete its children.
  if (element.children.length) return html
  element.textContent = text
  return serialize(doc)
}

/** Point an image at a different file, keeping its size and placement. */
export function setElementSrc(
  html: string,
  index: number,
  path: string,
  src: string,
): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  if (!root) return html
  const slide = slideElementAt(root, index)
  if (!slide) return html
  const element = elementAtPath(slide, path)
  if (!element || element === slide) return html
  if (element.tagName === 'IMG') {
    element.setAttribute('src', src)
    return serialize(doc)
  }
  // A placeholder is usually a styled box, not an <img>. Putting a picture in
  // one should keep the box — its size, radius and place in the layout — and
  // fill it, rather than replacing it with a bare image that sits differently.
  if (!element.children.length) {
    element.textContent = ''
    const image = doc.createElement('img')
    image.setAttribute('src', src)
    image.setAttribute('alt', '')
    image.setAttribute(
      'style',
      'width: 100%; height: 100%; object-fit: cover; display: block',
    )
    element.appendChild(image)
    return serialize(doc)
  }
  return html
}

export function insertVideoEmbed(html: string, index: number, markup: string, position: { x: number; y: number }): string {
  const doc = parse(html)
  if (!doc) return html
  const root = rootOf(doc)
  const slide = (root ? slideElementAt(root, index) : null) as HTMLElement | null
  if (!slide) return html
  const holder = doc.createElement('div')
  holder.innerHTML = markup
  const video = holder.firstElementChild as HTMLElement | null
  if (!video) return html
  if (!slide.style.position || slide.style.position === 'static') slide.style.position = 'relative'
  Object.assign(video.style, { position: 'absolute', left: `${position.x * 100}%`, top: `${position.y * 100}%`, width: '50%', zIndex: '1' })
  if (video.tagName === 'IMG') Object.assign(video.style, { height: '50%', objectFit: 'contain' })
  slide.append(video)
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
}
