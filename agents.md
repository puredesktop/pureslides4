# PureSlides4 — for agents

## Mission stage completion

In a mission, execute only the assigned stage. Read actual upstream files before
using their contents; a handoff summary is a pointer, not verification. Reopen
saved output and perform the requested checks/export. Then return the final
result immediately. The scheduler starts later stages: do not ask whether to
continue to another app, whether to stop here, or whether to submit the result.
Saving, checking and reporting this assigned work are already authorized.
Ask only for genuinely missing input that prevents this stage from proceeding.
YOLO changes approval gates; it does not answer questions, so do not manufacture
a finalization question.

Return exactly one JSON object, without fences or surrounding prose:
`{"taskOutcome":"Verified outcome of this stage", "artifactPaths":[], "observations":[]}`.
Check the spelling `taskOutcome` and all field types. List only this stage's
verified, saved outputs. Do not repeat successful writes to repair a final response.
Report unfinished work honestly; a saved draft is not a verified export.


A deck is ONE HTML document. Every slide is a direct child of the deck root
carrying `data-slide`, and the board is a view of that markup — there is no
second model. Every tool here rewrites the document.

## The deck root — get this right or nothing renders

```html
<div id="deck" data-deck-id="deck" data-width="1280" data-height="720"
     style="width: 1280px; height: 720px; position: relative; overflow: hidden">
  <div data-slide data-block="title" style="position: absolute; inset: 0">…</div>
  <div data-slide data-block="point" style="position: absolute; inset: 0">…</div>
</div>
```

Geometry lives on the root and nowhere else. A document with no root cannot
be presented or exported, and `checkDeck` refuses it — so does the door:
a `setDeck` or `setSlideHtml` that leaves the deck without a root is
refused as invalid, and nothing lands.

## Slides are ordered, not timed

This is the one place a deck differs from a video. PureVideo's scenes are
sequential in seconds, so moving one rewrites every start after it. Slides
advance when a person presses a key, so `moveSlide` is a pure reorder and
nothing else has to be recomputed. Time appears only in a video export, and
it is derived then.

A slide's headline goes in an `<h1>` and its second line in a `<p>`. The
board reads those two elements to show and edit a slide's copy, so a slide
built from unlabelled divs cannot be edited without rewriting it.

## Builds — the dynamic part, and why it is seekable

A descendant carrying `data-step="N"` (N ≥ 1) arrives on the Nth press;
anything without one is on from the start. Number them from 1 with no gaps —
a gap is a press that does nothing, and `checkDeck` warns about it.

Revealing is a class the document styles (`.pv-in` / `.pv-out`), and the
state is SET rather than played. That is what makes step 2 look identical
whether you pressed twice or jumped straight there — and therefore what lets
one model serve the board's preview, presenting, the PDF (every step
revealed) and the video (steps spread across each slide's seconds).

Build lists and reveals. Do NOT build a headline in: the room needs to know
what it is looking at.

## Reach for a composition, don't invent one

`listBlocks` offers fourteen layouts that carry meaning in their arrangement
— title, statement, points that build, cards, two column, full-bleed image,
screenshot, quote, number, before-and-after, sequence, agenda, divider, end
card. Each says what it is FOR and how many presses it takes. `addBlock` adds
one; then edit it like any other slide.

Use them. A deck written from nothing comes out as fifteen headline-and-
bullets slides, because that is the shape that always fits — and a room can
feel it.

## Video on a slide

A slide can hold a clip: a `<video>` whose `src` is a file in the package's
`assets/` — `<video data-video src="assets/demo.mp4" playsinline
preload="metadata">`. Two compositions carry one: `video-full` (edge to
edge, words over it) and `video` (a clip in a frame under a headline).
The path is `addAsset` the clip, then `addBlock` with `asset: "demo.mp4"`
— the clip goes into the block's slot and the "replace with a video" cover
goes. `setElement` on an existing `<video>` does the same by hand.

The clip PLAYS when its slide comes up on a live surface (the stage,
presenting) and stops when the slide goes; a step press leaves it running.
Sound is tried first, muted is the fallback. `data-video-play="manual"`
keeps a clip from starting on its own. A card, a measurement, a print and a
frame capture show its first frame, never play.

What each export does with it:

- **PDF** — paper cannot play. The clip prints as its `poster` where it has
  one, otherwise as a dark panel with a play mark naming the file.
- **PowerPoint** — the real clip, laid over the slide's picture at the
  place the board shows it, with the picture's own pixels as its cover, so
  nothing shifts when it starts. MP4 (H.264) plays in PowerPoint; other
  formats are embedded but may show as a still.
- **Images and video** — the first frame, as captured.

`checkDeck` warns about a slot with nothing in it (`video-empty`), a clip
from the network (`remote-video`) and a format PowerPoint may not play
(`video-format`); none of them block.

## "This" and "these" mean something — find out what

A request that points rather than names is about whatever the author has
aimed at. `getDeckContext` returns it as `aim`:

- `{ scope: 'elements', slideIndex, elements: [{ path, label }] }` — change
  only those, with `setElement` or `deleteElement`.
- `{ scope: 'slides', slideIndexes }` — several slides; keep them consistent.
- `{ scope: 'slide', slideIndex }` — the slide on screen. The default.

`setSelection` is the same channel in reverse: select what you are about to
change so the author sees it first.

## Assets have a role

`listAssets` reports one for each file:

- **`content`** (default) — material a slide may show.
- **`reference`** — a design reference. Never placed on a slide; it is the
  look the deck is built to. Read the palette, type and spacing off it.
- **`logo`** — the brand mark, for the title and closing slides.

## Starting a deck from a brief

Not "write eight slides by hand". The author's path is:

1. `addAsset` each file, `setAssetRole` for references and logos,
   `describeAsset` every image — a description is what a slide gets written
   FROM, and an undescribed file is skipped rather than used badly.
2. `setBrief` with what the deck is for and roughly how many slides.
3. `draftDeck`.

`draftDeck` now PREPARES a durable request and returns immediately. It never
runs another model. Read getDrawerRequest, use its design guide and base HTML,
compose here in the drawer, then call commitDrawerRequest with requestId,
baseHash and complete HTML (including notes/build attributes). For a draft,
replace the untouched starter; preserve existing slides unless asked to replace.
For edits, only the saved slide/element scope may change; head/CSS and other
slides are protected by a deterministic comparison. Pass the full valid deck.
Images supplied with UI requests are actual pixels. Tool-triggered requests
must use available image-viewing tools on the exact saved files; paths and
filenames alone are not evidence. Do not invent descriptions if pixels cannot
be viewed. A description request commits a descriptions array instead of HTML.
No nested model call or same-runner message dispatch is used by tools.
Commit results distinguish persisted from checked: run checkDeck afterward,
repair findings, export when requested, and reopen the saved output for handoff.
Retries of a committed request return the receipt; changed documents require
reconciliation and a fresh request. New requests replace the previous request.

## The hash — read, then edit, then read again

Every read (`getDeckContext`, `getSlide`, `listSlides`) returns `hash`, the
content hash of the deck as you saw it. Every mutating tool takes
`baseHash`. Pass it, always: an edit whose base is not the current hash is
REFUSED — the author typed, an ask landed, another tool ran — and the
refusal carries the current hash and says to re-read. Redo the edit
against the deck as it is now; never retry blind. Every landed edit
returns the new `hash`, which is the base for your next one.

`baseHash` is optional for one release so older prompts keep working; a
stale hash, when given, is refused all the same. There is one door for
every change — yours, the author's, the ask box's — so nothing you write
can overwrite something you did not read.

## Verification — what "checked" means, and the words

The board measures every slide as it renders it: an overflowing slide is
scaled to fit, and two elements that both carry content and sit on top of
each other are reported as an overlap that scaling cannot fix. That
measurement is only worth something under the right conditions, so the
deck's render is in one of three states (`getDeckContext.verification`,
`checkDeck.layout`):

- **verified** — "Layout checked": every slide measured cleanly, in a frame
  with geometry, with its fonts loaded.
- **checking** — "Layout being checked": some slide has not been measured
  in a visible frame with loaded fonts yet (the app was hidden, a web font
  was still arriving, the Files pane was up, the html just changed). Never
  treated as verified; it clears when a visible frame confirms it.
- **failed** — "Slide 4 has overlapping text": a clean measurement whose
  content overlaps. A fault in the slide, not the view — change the layout
  (`setElement`, `setSlideHtml`); scaling and re-checking will not fix it.

## Presenting and exporting

`present` opens the deck full screen from a slide. `exportDeck` takes
`pdf` (one page per slide, every build revealed — paper has no presses; a
clip prints as its poster or a labelled panel), `images` (a PNG per
slide), `pptx` (a PowerPoint file: one picture slide per slide, the
board's render, speaker notes attached, every clip placed as real video
that plays — it opens in PowerPoint, Keynote and Google Slides, but its
text is a picture, not type) or `video` (slides on a clock).

The export is the render: the PDF prints the same markup the board shows,
driven by the same seek script (one core for showing a slide, applying a
step and fitting it), so a page is the preview at its last step. The
pipeline measures every slide again before writing anything and REFUSES
when the layout is not verified — an overlapping slide, a check that could
not finish, a `checkDeck` error. The refusal names the slides and what to
do; there is no way around it, for you or the button. A PDF whose sheet
count does not match the deck is reported out loud, not handed over.

## History — every rewrite is undoable

Before an ask, a `setDeck`, any slide or element tool, a draft or a
restore lands, the deck AS IT WAS is copied into the package's `history/`
folder (12 kept, deduped). `listRevisions` lists them newest first with
`textChars` per entry; `restoreRevision` puts one back through the same
door, snapshotting the current deck first, so a restore is itself
undoable. An edit result reports `textRemoved` when more than about a
third of the visible text vanished and the request did not ask for
anything to be removed — that is your cue to restore and redo the edit
carrying the content forward.

## Reference mapping

| Task | Tools |
| --- | --- |
| See what is open, and what "this" means | `getDeckContext` |
| See the slides in order | `listSlides` |
| Read one slide's markup | `getSlide` |
| Add, retime, reorder or cut a slide | `addSlide`, `updateSlide`, `moveSlide`, `duplicateSlide`, `deleteSlide` |
| Rewrite one slide | `setSlideHtml` |
| Retype one element | `getDeckContext` → `setElementText` |
| Rewrite one element | `getDeckContext` → `setElement` |
| Add a ready-made layout | `listBlocks` → `addBlock` |
| Put a clip on a slide | `addAsset` → `addBlock` (`video-full` or `video`, with `asset`) |
| Remove one element | `getDeckContext` → `deleteElement` |
| Make something arrive on a press | `setElementStep` |
| Speaker notes | `updateSlide` with `notes` |
| Files | `addAsset`, `setAssetRole`, `describeAsset`, `listAssets` |
| Start a deck | `setBrief` → `draftDeck` |
| Show the author what you mean | `setSelection` |
| Sanity-check, and read the layout state | `checkDeck` |
| Present it | `present` |
| Get it out (refused unless verified) | `exportDeck`, `stopExport` |
| See what a rewrite replaced | `listRevisions` |
| Put a previous version back | `listRevisions` → `restoreRevision` |

If the user abandons a saved request, cancelDrawerRequest with its requestId. It refuses late commits; stopping the runner alone preserves the request for later recovery.
