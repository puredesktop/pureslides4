import { describe, expect, it } from 'vitest'
import { base64FromBytes, canEncodeVideo, encodeFramesToMp4 } from './encodeMp4'

describe('base64FromBytes', () => {
  it('encodes bytes the way btoa would, chunked', () => {
    const bytes = new TextEncoder().encode('hello mp4')
    expect(base64FromBytes(bytes)).toBe(btoa('hello mp4'))
  })

  it('survives inputs larger than one chunk', () => {
    const bytes = new Uint8Array(0x8000 + 7).fill(65)
    const decoded = atob(base64FromBytes(bytes))
    expect(decoded.length).toBe(bytes.length)
    expect(decoded[0]).toBe('A')
    expect(decoded[decoded.length - 1]).toBe('A')
  })
})

describe('encodeFramesToMp4', () => {
  it('refuses honestly when the runtime has no encoder', async () => {
    // happy-dom ships no WebCodecs, which is exactly the runtime the frame
    // fallback exists for.
    expect(canEncodeVideo()).toBe(false)
    await expect(encodeFramesToMp4(1, async () => '', {
      width: 1280,
      height: 720,
      fps: 30,
    })).rejects.toThrow('VideoEncoder')
  })
})
