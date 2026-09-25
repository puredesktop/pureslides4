import { describe, expect, it } from 'vitest'
import { hasVideo, packageSource } from './videoPlacements'

describe('a clip\'s source for the export', () => {
  it('is the package path, mapped back from the frame\'s inlined bytes', () => {
    const previews = { 'demo.mp4': 'data:video/mp4;base64,AAAA' }
    expect(packageSource('assets/demo.mp4', previews)).toBe('assets/demo.mp4')
    expect(packageSource('./assets/demo.mp4', previews)).toBe('assets/demo.mp4')
    expect(packageSource('data:video/mp4;base64,AAAA', previews)).toBe('assets/demo.mp4')
  })

  it('is nothing for bytes it cannot name, or a clip that is not a file in the package', () => {
    expect(packageSource('data:video/mp4;base64,ZZZZ', {})).toBeNull()
    expect(packageSource('https://cdn.example.com/x.mp4', {})).toBeNull()
    expect(packageSource('', {})).toBeNull()
  })

  it('knows whether a deck has a clip at all', () => {
    expect(hasVideo('<div><video src="assets/a.mp4"></video></div>')).toBe(true)
    expect(hasVideo('<div><img src="assets/a.png"></div>')).toBe(false)
  })
})
