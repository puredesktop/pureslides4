import { describe, expect, it } from 'vitest'
import { kindOf, mergeMaterial, notesFrom } from './material'

describe('material', () => {
  it('recognises what each file is', () => {
    expect(kindOf('shot.png')).toBe('image')
    expect(kindOf('clip.mp4')).toBe('video')
    expect(kindOf('bed.m4a')).toBe('audio')
    expect(kindOf('Inter.woff2')).toBe('font')
    expect(kindOf('notes.txt')).toBe('other')
  })

  it('pairs files on disk with what the manifest says they show', () => {
    const merged = mergeMaterial(
      [
        { name: 'writer.png', bytes: 1200 },
        { name: 'bed.m4a' },
        { name: '.keep' },
      ],
      [{ name: 'writer.png', description: 'the writer', described: true }],
    )
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({
      name: 'writer.png',
      description: 'the writer',
      described: true,
      reference: 'assets/writer.png',
      kind: 'image',
      bytes: 1200,
    })
    expect(merged[1].description).toBe('')
  })

  it('keeps only real descriptions when writing back', () => {
    const notes = notesFrom(
      mergeMaterial(
        [{ name: 'a.png' }, { name: 'b.png' }],
        [
          { name: 'a.png', description: '  a shot  ' },
          { name: 'b.png', description: '   ' },
        ],
      ),
    )
    expect(notes).toEqual([{ name: 'a.png', description: 'a shot' }])
  })
})

describe('roles', () => {
  it('defaults to content and keeps a set role through the manifest', () => {
    const items = mergeMaterial([{ name: 'poster.png' }, { name: 'shot.png' }], [
      { name: 'poster.png', description: '', role: 'reference' },
    ])
    expect(items[0].role).toBe('reference')
    expect(items[1].role).toBe('content')

    // A reference with no description still has to survive the round trip —
    // dropping it would silently un-mark the file that sets the whole look.
    const notes = notesFrom(items)
    expect(notes).toEqual([{ name: 'poster.png', description: '', role: 'reference' }])
    expect(mergeMaterial([{ name: 'poster.png' }], notes)[0].role).toBe('reference')
  })
})
