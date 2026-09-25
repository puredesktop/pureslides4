import { elementAtPath, slideElementAt } from './slides'
export interface DrawerRequest {
  descriptionBase?: string
  sessionId?: string
  id: string
  path: string
  baseHash: string
  html: string
  prompt: string
  kind: 'draft' | 'edit' | 'describe'
  indexes: number[]
  elementPaths: string[]
  images: { name: string; sha256: string }[]
  status: 'prepared' | 'committed' | 'cancelled'
  outputHash?: string
}
export async function digest(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  ]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
/** Mask only selected nodes: everything else, including head/styles/root, must survive. */
export function assertScope(request: DrawerRequest, next: string): void {
  if (request.kind !== 'edit') return
  const mask = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const root =
      doc.querySelector('[data-deck-id]') ?? doc.querySelector('#deck')
    if (!root) throw Error('Missing deck root.')
    const selected = request.indexes.map(index => ({
      index,
      slide: slideElementAt(root, index),
    }))
    for (const { index, slide } of selected) {
      if (!slide) throw Error('Selected slide is missing.')
      if (request.elementPaths.length) {
        const targets = request.elementPaths.map(path =>
          elementAtPath(slide, path),
        )
        if (targets.some(t => !t))
          throw Error('Selected element is missing. Preserve its position.')
        targets.forEach((node, i) =>
          node!.replaceWith(doc.createComment(`selected-${i}`)),
        )
      } else slide.replaceWith(doc.createComment(`selected-slide-${index}`))
    }
    return doc.documentElement.outerHTML
  }
  if (mask(request.html) !== mask(next))
    throw Error(
      'Edit changed content outside the saved selection. Return only changes within the selected nodes.',
    )
}

/** Only the saved document request owns its conversation; viewport metadata can be stale. */
export function requestSession(
  request: DrawerRequest | null,
  path: string,
  hash: string,
): string | null {
  return request && (request.path === path || request.outputHash === hash)
    ? request.sessionId ?? null
    : null
}

type DescribedMaterial = { name: string; description: string; role?: string }
export function descriptionState(items: DescribedMaterial[]): string {
  return JSON.stringify(
    items
      .map(({ name, description, role }) => ({ name, description, role: role ?? 'content' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
}
export function assertDescriptionScope(
  request: DrawerRequest,
  current: DescribedMaterial[],
  proposed: DescribedMaterial[],
): void {
  const state = descriptionState(current)
  if (
    request.descriptionBase !== undefined &&
    state !== request.descriptionBase &&
    state !== descriptionState(proposed)
  )
    throw Error(
      'Asset descriptions or roles changed. Prepare a new description request.',
    )
}
