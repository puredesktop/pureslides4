/**
 * What will go wrong before it goes wrong.
 *
 * A deck fails in ways a video does not: a build skips step 2 so a press
 * does nothing; an image, font or script is fetched from the network that
 * will not be there in the room; a script calls document.write and erases
 * the deck. Errors block presenting and exporting; warnings are worth
 * knowing and no more.
 */
export type CheckSeverity = 'error' | 'warning'

export interface CheckFinding {
  severity: CheckSeverity
  code: string
  message: string
  /** What to do instead. */
  fix: string
  /** Which slide it is about, when it is about one. */
  slide?: number
}

export function hasBlockingFinding(findings: CheckFinding[]): boolean {
  return findings.some(finding => finding.severity === 'error')
}

function stripStringsAndComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
}

export function checkDeck(html: string): CheckFinding[] {
  const findings: CheckFinding[] = []
  if (typeof DOMParser === 'undefined') return findings
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')

  if (!root) {
    return [
      {
        severity: 'error',
        code: 'no-deck-root',
        message: 'the document has no deck root',
        fix: 'wrap the slides in <div id="deck" data-deck-id="deck" data-width data-height>',
      },
    ]
  }

  const slides = [...root.children].filter(child => child.matches('[data-slide]'))
  if (!slides.length && !root.children.length) {
    findings.push({
      severity: 'error',
      code: 'no-slides',
      message: 'the deck has no slides',
      fix: 'add a slide: a direct child of the root carrying data-slide',
    })
  }

  slides.forEach((slide, index) => {
    // A build that skips a number has a press that does nothing.
    const steps = [...slide.querySelectorAll('[data-step]')]
      .map(node => Number(node.getAttribute('data-step')))
      .filter(step => Number.isFinite(step) && step > 0)
      .sort((a, b) => a - b)
    const unique = [...new Set(steps)]
    unique.forEach((step, order) => {
      if (step !== order + 1) {
        findings.push({
          severity: 'warning',
          code: 'step-gap',
          slide: index,
          message: `slide ${index + 1} jumps to build step ${step}`,
          fix: 'number build steps from 1 with no gaps, or a press will do nothing',
        })
      }
    })

    const image = slide.querySelector('img[src]')
    const src = image?.getAttribute('src') ?? ''
    if (src && /^https?:/i.test(src)) {
      findings.push({
        severity: 'warning',
        code: 'remote-image',
        slide: index,
        message: `slide ${index + 1} loads an image over the network`,
        fix: 'add the file with addAsset and reference it as assets/<name>',
      })
    }

    // A video slot with nothing in it shows its cover; a clip from the
    // network is not there in the room; a format PowerPoint cannot play is
    // a still in the export.
    for (const video of slide.querySelectorAll('video')) {
      const clip = video.getAttribute('src') ?? video.querySelector('source')?.getAttribute('src') ?? ''
      if (!clip) {
        findings.push({
          severity: 'warning',
          code: 'video-empty',
          slide: index,
          message: `slide ${index + 1} has a video frame with no file in it`,
          fix: 'addAsset the clip, then addBlock with asset (or setElement the <video> with src="assets/<name>")',
        })
        continue
      }
      if (/^https?:/i.test(clip)) {
        findings.push({
          severity: 'warning',
          code: 'remote-video',
          slide: index,
          message: `slide ${index + 1} plays a video over the network`,
          fix: 'add the file with addAsset and reference it as assets/<name>',
        })
      } else if (!/\.(mp4|m4v)(?:[?#].*)?$/i.test(clip)) {
        findings.push({
          severity: 'warning',
          code: 'video-format',
          slide: index,
          message: `slide ${index + 1} uses a video PowerPoint may not play (${clip.split('/').pop()})`,
          fix: 'MP4 (H.264) plays everywhere; the PDF and the PowerPoint export show a still for anything else',
        })
      }
    }
  })

  const head = doc.head?.innerHTML ?? ''
  if (/<link[^>]+href=["']https?:/i.test(head)) {
    findings.push({
      severity: 'warning',
      code: 'remote-font',
      message: 'the deck loads a stylesheet or font over the network',
      fix: 'embed the face, or accept the fallback if the room has no network',
    })
  }

  // Same rule as remote fonts: a <script src="https://…"> is a dependency the
  // room's network may not honour, and the sandboxed renderers never will.
  if (
    [...doc.querySelectorAll('script[src]')].some(node =>
      /^https?:/i.test(node.getAttribute('src') ?? ''),
    )
  ) {
    findings.push({
      severity: 'warning',
      code: 'remote-script',
      message: 'the deck loads a script over the network',
      fix: 'inline the script, or accept that it will not run offline or in exports',
    })
  }

  const scripts = [...doc.querySelectorAll('script')]
    .map(node => stripStringsAndComments(node.textContent ?? ''))
    .join('\n')
  if (/\bdocument\.write\b/.test(scripts)) {
    findings.push({
      severity: 'error',
      code: 'document-write',
      message: 'a slide calls document.write',
      fix: 'build the markup instead — document.write erases the deck when it runs',
    })
  }

  return findings
}
