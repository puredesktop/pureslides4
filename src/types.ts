export type { DeckDocument, DeckGeometry } from './lib/deckDocument'
export type { ExportProgressState, ExportKind } from './lib/exportDeck'

/** Which pane of the board is up. */
export type BoardTab = 'slides' | 'assets'

/** An element the author picked in a slide, and what to call it. */
export interface PickedElement {
  /** Chain of child indexes from the slide, as the preview reports it. */
  path: string
  label: string
}
