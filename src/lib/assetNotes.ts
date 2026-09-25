/**
 * What a file is FOR, which is not the same as what it is.
 *
 * A screenshot is content; a poster whose look you want is a reference and
 * must never appear on a slide — it steers how the deck is drawn. Getting
 * this wrong is how a mood board ends up as slide four.
 */
export type AssetRole = 'content' | 'reference' | 'logo'

export interface AssetNote {
  /** File name inside `assets/`. */
  name: string
  /** What it shows — written by the model, or by hand. */
  description: string
  /** True when the description came from the model looking at the file. */
  described?: boolean
  /** Defaults to 'content' when absent. */
  role?: AssetRole
}
