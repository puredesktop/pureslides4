/**
 * Slide compositions worth reaching for.
 *
 * A deck written from nothing tends to come out as fifteen headline-and-
 * bullets slides, because that is the shape that always fits. This is a
 * catalogue of layouts that carry meaning in their arrangement — a comparison
 * reads as a comparison, a number reads as a number — so drafting has
 * somewhere to go and "+ Add a slide" is a choice rather than a blank.
 *
 * They are ordinary markup: absolute inside the frame, an `<h1>` for the
 * headline and a `<p>` for the line under it so the board can edit them, and
 * `data-step` where the composition wants to arrive in pieces. Nothing here
 * is a template engine — a block is a starting point you then edit.
 */

export interface SlideBlock {
  id: string
  label: string
  /** What it is FOR — the reason to pick this one over the next. */
  description: string
  /** How many presses it takes as written. */
  steps: number
  /** The kind of file the block has a slot for, when it has one. */
  media?: 'video'
  html: string
}

/** A file from the package to put in the block's slot as it is added. */
export interface BlockFill {
  /** File name inside `assets/` — `demo.mp4`, not a path. */
  asset?: string
}

/**
 * The block's markup with its slot filled: a video block gets
 * `src="assets/<name>"` on its `[data-video]` element and loses the
 * "replace with a video" cover. A block with no slot, or no fill, is
 * returned as written.
 */
export function blockHtmlWith(block: SlideBlock, fill: BlockFill = {}): string {
  const asset = fill.asset?.trim()
  if (!asset || block.media !== 'video' || typeof DOMParser === 'undefined') return block.html
  const doc = new DOMParser().parseFromString(`<body>${block.html}</body>`, 'text/html')
  const video = doc.querySelector('[data-video]')
  if (!video) return block.html
  video.setAttribute('src', `assets/${asset}`)
  doc.querySelectorAll('[data-video-empty]').forEach(node => node.remove())
  return doc.body.innerHTML.trim()
}

const FRAME =
  'position: absolute; inset: 0; display: flex; flex-direction: column; background: #ffffff; color: #1b1b1e'

export const SLIDE_BLOCKS: SlideBlock[] = [
  {
    id: 'title',
    label: 'Title',
    description: 'Opens the deck: the promise in one line, and who is making it.',
    steps: 0,
    html: `<div data-slide data-block="title" style="${FRAME}; align-items: center; justify-content: center; text-align: center; gap: 20px; padding: 0 120px">
  <div style="font-size: 21px; letter-spacing: 0.3em; text-transform: uppercase; color: #9a9aa0">Eyebrow</div>
  <h1 style="margin: 0; font-size: 76px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02">The promise, in one line</h1>
  <p style="margin: 0; font-size: 26px; color: #3a3a3e">Who is making it, and to whom.</p>
</div>`,
  },
  {
    id: 'statement',
    label: 'Statement',
    description: 'One sentence, large. For the idea the room should leave with.',
    steps: 0,
    html: `<div data-slide data-block="statement" style="${FRAME}; justify-content: center; gap: 26px; padding: 0 110px">
  <h1 style="margin: 0; font-size: 64px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08">Work lives in projects, not chat threads</h1>
  <div style="width: 220px; height: 3px; background: #1b1b1e"></div>
  <p style="margin: 0; font-size: 26px; color: #3a3a3e; max-width: 26ch">The line that makes it land.</p>
</div>`,
  },
  {
    id: 'points',
    label: 'Points that build',
    description: 'Three or four points arriving one press at a time.',
    steps: 3,
    html: `<div data-slide data-block="points" style="${FRAME}; justify-content: center; gap: 22px; padding: 0 110px">
  <h1 style="margin: 0; font-size: 54px; font-weight: 800; letter-spacing: -0.03em">Three things</h1>
  <p style="margin: 0; font-size: 25px; color: #6d6f73">The line under the headline.</p>
  <div style="display: flex; flex-direction: column; gap: 14px; margin-top: 10px">
    <div data-step="1" style="font-size: 28px">The first one</div>
    <div data-step="2" style="font-size: 28px">The second one</div>
    <div data-step="3" style="font-size: 28px">And the third</div>
  </div>
</div>`,
  },
  {
    id: 'cards',
    label: 'Cards',
    description: 'Three or four parallel ideas side by side, numbered.',
    steps: 0,
    html: `<div data-slide data-block="cards" style="${FRAME}; justify-content: center; gap: 30px; padding: 0 90px">
  <div style="display: flex; flex-direction: column; gap: 10px">
    <h1 style="margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.03em">Four parallel ideas</h1>
    <p style="margin: 0; font-size: 24px; color: #6d6f73">The line under the headline.</p>
  </div>
  <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px">
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 22px; border: 1px solid #e5e5e9; border-radius: 12px; background: #fbfbfc">
      <div style="font-size: 20px; color: #9a9aa0">01</div>
      <div style="font-size: 24px; font-weight: 700; line-height: 1.2">First idea</div>
      <div style="font-size: 21px; color: #3a3a3e; line-height: 1.45">What it means in a sentence.</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 22px; border: 1px solid #e5e5e9; border-radius: 12px; background: #fbfbfc">
      <div style="font-size: 20px; color: #9a9aa0">02</div>
      <div style="font-size: 24px; font-weight: 700; line-height: 1.2">Second idea</div>
      <div style="font-size: 21px; color: #3a3a3e; line-height: 1.45">What it means in a sentence.</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 22px; border: 1px solid #e5e5e9; border-radius: 12px; background: #fbfbfc">
      <div style="font-size: 20px; color: #9a9aa0">03</div>
      <div style="font-size: 24px; font-weight: 700; line-height: 1.2">Third idea</div>
      <div style="font-size: 21px; color: #3a3a3e; line-height: 1.45">What it means in a sentence.</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 22px; border: 1px solid #e5e5e9; border-radius: 12px; background: #f2f0eb">
      <div style="font-size: 20px; color: #9a9aa0">04</div>
      <div style="font-size: 24px; font-weight: 700; line-height: 1.2">Fourth idea</div>
      <div style="font-size: 21px; color: #3a3a3e; line-height: 1.45">What it means in a sentence.</div>
    </div>
  </div>
</div>`,
  },
  {
    id: 'two-column',
    label: 'Two column',
    description: 'Words on one side, a picture or a list on the other.',
    steps: 0,
    html: `<div data-slide data-block="two-column" style="${FRAME}; flex-direction: row; align-items: center; gap: 56px; padding: 0 90px">
  <div style="flex: 1; display: flex; flex-direction: column; gap: 18px">
    <h1 style="margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.08">The point, on the left</h1>
    <p style="margin: 0; font-size: 24px; color: #3a3a3e; line-height: 1.5">Two or three sentences that carry the argument. The picture is the evidence.</p>
  </div>
  <div style="flex: 1; align-self: stretch; margin: 60px 0; border-radius: 12px; background: #f2f0eb; display: grid; place-items: center; color: #9a9aa0; font-size: 21px">Replace with an image</div>
</div>`,
  },
  {
    id: 'image-full',
    label: 'Full-bleed image',
    description: 'A picture edge to edge, with the words laid over it.',
    steps: 0,
    html: `<div data-slide data-block="image-full" style="position: absolute; inset: 0; background: #101013; color: #ffffff; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 70px">
  <div data-bg style="position: absolute; inset: 0; background: #2a2a30; display: grid; place-items: center; color: #6d6f73; font-size: 21px">Replace with an image</div>
  <div data-bg style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,8,10,0.82) 0%, rgba(8,8,10,0) 55%)"></div>
  <div style="position: relative; padding: 0 90px; display: flex; flex-direction: column; gap: 12px">
    <h1 style="margin: 0; font-size: 56px; font-weight: 800; letter-spacing: -0.03em">Words over the picture</h1>
    <p style="margin: 0; font-size: 24px; color: #d5d5db">The line that says what it shows.</p>
  </div>
</div>`,
  },
  {
    id: 'video-full',
    label: 'Full-bleed video',
    description: 'A clip edge to edge, with the words laid over it. Plays when the slide comes up.',
    steps: 0,
    media: 'video',
    html: `<div data-slide data-block="video-full" style="position: absolute; inset: 0; background: #101013; color: #ffffff; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 0 70px">
  <video data-video playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; background: #101013"></video>
  <div data-video-empty style="position: absolute; inset: 0; display: grid; place-items: center; color: #6d6f73; font-size: 21px">Replace with a video</div>
  <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(8,8,10,0.82) 0%, rgba(8,8,10,0) 55%); pointer-events: none"></div>
  <div style="position: relative; padding: 0 90px; display: flex; flex-direction: column; gap: 12px">
    <h1 style="margin: 0; font-size: 56px; font-weight: 800; letter-spacing: -0.03em">What the room is about to watch</h1>
    <p style="margin: 0; font-size: 24px; color: #d5d5db">One line on why it matters.</p>
  </div>
</div>`,
  },
  {
    id: 'video',
    label: 'Video',
    description: 'A clip in a frame under a headline, like a screenshot that moves. Plays when the slide comes up.',
    steps: 0,
    media: 'video',
    html: `<div data-slide data-block="video" style="${FRAME}; gap: 20px; padding: 66px 90px 56px">
  <div style="display: flex; flex-direction: column; gap: 8px">
    <h1 style="margin: 0; font-size: 54px; font-weight: 800; letter-spacing: -0.03em">Watch it happen</h1>
    <p style="margin: 0; font-size: 22px; color: #6d6f73">The one thing to notice in it.</p>
  </div>
  <div style="position: relative; flex: 1; min-height: 0; border: 1px solid #e5e5e9; border-radius: 12px; background: #101013; overflow: hidden">
    <video data-video playsinline preload="metadata" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover"></video>
    <div data-video-empty style="position: absolute; inset: 0; display: grid; place-items: center; color: #6d6f73; font-size: 21px">Replace with a video</div>
  </div>
</div>`,
  },
  {
    id: 'screenshot',
    label: 'Screenshot',
    description: 'A shot of the thing, captioned. What most product decks need.',
    steps: 0,
    html: `<div data-slide data-block="screenshot" style="${FRAME}; gap: 20px; padding: 66px 90px 56px">
  <div style="display: flex; flex-direction: column; gap: 8px">
    <h1 style="margin: 0; font-size: 54px; font-weight: 800; letter-spacing: -0.03em">What it looks like</h1>
    <p style="margin: 0; font-size: 22px; color: #6d6f73">The one thing to notice in it.</p>
  </div>
  <div style="flex: 1; min-height: 0; border: 1px solid #e5e5e9; border-radius: 12px; background: #f2f0eb; display: grid; place-items: center; color: #9a9aa0; font-size: 21px; overflow: hidden">Replace with an image</div>
</div>`,
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Someone else’s words, and who said them.',
    steps: 0,
    html: `<div data-slide data-block="quote" style="${FRAME}; align-items: center; justify-content: center; gap: 30px; padding: 0 140px; background: #f8f8fa; text-align: center">
  <h1 style="margin: 0; font-size: 56px; font-weight: 500; font-style: italic; line-height: 1.32; letter-spacing: -0.015em">“The sentence that made the case better than we could.”</h1>
  <p style="margin: 0; font-size: 22px; color: #6d6f73">Who said it · where they work</p>
</div>`,
  },
  {
    id: 'stat',
    label: 'Number',
    description: 'One figure, big, with the sentence that gives it meaning.',
    steps: 0,
    html: `<div data-slide data-block="stat" style="${FRAME}; align-items: center; justify-content: center; gap: 18px; padding: 0 120px; text-align: center">
  <h1 style="margin: 0; font-size: 168px; font-weight: 800; letter-spacing: -0.05em; line-height: 0.9">80%</h1>
  <p style="margin: 0; font-size: 28px; color: #3a3a3e; max-width: 24ch">What the number is of, and why it matters.</p>
</div>`,
  },
  {
    id: 'compare',
    label: 'Before and after',
    description: 'Two states side by side. The arrangement carries the argument.',
    steps: 1,
    html: `<div data-slide data-block="compare" style="${FRAME}; justify-content: center; gap: 28px; padding: 0 90px">
  <h1 style="margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.03em">Before, and after</h1>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px">
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 12px; background: #f2f2f4">
      <div style="font-size: 20px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a9aa0">Before</div>
      <div style="font-size: 26px; font-weight: 600; line-height: 1.3">How it works today</div>
      <div style="font-size: 22px; color: #3a3a3e; line-height: 1.5">And what that costs.</div>
    </div>
    <div data-step="1" style="display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 12px; background: #1b1b1e; color: #ffffff">
      <div style="font-size: 20px; letter-spacing: 0.14em; text-transform: uppercase; color: #9a9aa0">After</div>
      <div style="font-size: 26px; font-weight: 600; line-height: 1.3">How it works instead</div>
      <div style="font-size: 22px; color: #d5d5db; line-height: 1.5">And what that buys.</div>
    </div>
  </div>
</div>`,
  },
  {
    id: 'steps',
    label: 'Sequence',
    description: 'A process in order, arriving one stage at a time.',
    steps: 3,
    html: `<div data-slide data-block="steps" style="${FRAME}; justify-content: center; gap: 26px; padding: 0 90px">
  <h1 style="margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.03em">How it goes</h1>
  <div style="display: flex; align-items: stretch; gap: 14px">
    <div data-step="1" style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 24px; border-left: 3px solid #1b1b1e; background: #f8f8fa">
      <div style="font-size: 20px; letter-spacing: 0.14em; color: #9a9aa0">STEP ONE</div>
      <div style="font-size: 24px; font-weight: 600">What happens first</div>
    </div>
    <div data-step="2" style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 24px; border-left: 3px solid #1b1b1e; background: #f8f8fa">
      <div style="font-size: 20px; letter-spacing: 0.14em; color: #9a9aa0">STEP TWO</div>
      <div style="font-size: 24px; font-weight: 600">Then this</div>
    </div>
    <div data-step="3" style="flex: 1; display: flex; flex-direction: column; gap: 8px; padding: 24px; border-left: 3px solid #1b1b1e; background: #f8f8fa">
      <div style="font-size: 20px; letter-spacing: 0.14em; color: #9a9aa0">STEP THREE</div>
      <div style="font-size: 24px; font-weight: 600">And it ends here</div>
    </div>
  </div>
</div>`,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    description: 'What the next ten minutes hold. Also works as a recap.',
    steps: 0,
    html: `<div data-slide data-block="agenda" style="${FRAME}; justify-content: center; gap: 24px; padding: 0 110px">
  <h1 style="margin: 0; font-size: 58px; font-weight: 800; letter-spacing: -0.03em">What we will cover</h1>
  <div style="display: flex; flex-direction: column">
    <div style="display: flex; gap: 20px; padding: 16px 0; border-bottom: 1px solid #e5e5e9; font-size: 25px"><span style="color: #9a9aa0; min-width: 34px">01</span> The first thing</div>
    <div style="display: flex; gap: 20px; padding: 16px 0; border-bottom: 1px solid #e5e5e9; font-size: 25px"><span style="color: #9a9aa0; min-width: 34px">02</span> The second thing</div>
    <div style="display: flex; gap: 20px; padding: 16px 0; border-bottom: 1px solid #e5e5e9; font-size: 25px"><span style="color: #9a9aa0; min-width: 34px">03</span> The third thing</div>
  </div>
</div>`,
  },
  {
    id: 'divider',
    label: 'Section divider',
    description: 'A breath between parts. Says where the room has got to.',
    steps: 0,
    html: `<div data-slide data-block="divider" style="position: absolute; inset: 0; background: #101013; color: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px">
  <div style="font-size: 21px; letter-spacing: 0.3em; text-transform: uppercase; color: #6d6f73">Part two</div>
  <h1 style="margin: 0; font-size: 64px; font-weight: 800; letter-spacing: -0.03em">What it costs</h1>
</div>`,
  },
  {
    id: 'end',
    label: 'End card',
    description: 'Closes: where to go next, and one way to act.',
    steps: 0,
    html: `<div data-slide data-block="end" style="position: absolute; inset: 0; background: #101013; color: #ffffff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px">
  <h1 style="margin: 0; font-size: 60px; font-weight: 800; letter-spacing: -0.03em">Thank you</h1>
  <p style="margin: 0; font-size: 26px; color: #d5d5db">where.to@go.next</p>
</div>`,
  },
]

export function blockCatalogue(): { id: string; label: string; description: string; steps: number; media?: 'video' }[] {
  return SLIDE_BLOCKS.map(({ id, label, description, steps, media }) => ({
    id,
    label,
    description,
    steps,
    ...(media ? { media } : {}),
  }))
}

export function findBlock(id: string): SlideBlock | undefined {
  return SLIDE_BLOCKS.find(block => block.id === id)
}
