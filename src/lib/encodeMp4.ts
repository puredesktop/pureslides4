/**
 * Encoding captured frames into an MP4, in the browser.
 *
 * Chromium ships WebCodecs, so a video encoder is already in the room — no
 * FFmpeg, no sidecar process, nothing to install. We hand it decoded frames
 * and mux the compressed chunks into an MP4 container. When the runtime
 * cannot do this, the caller keeps the PNG sequence instead and says so;
 * silently producing nothing would be worse than an honest frame folder.
 *
 * Ported from PureVideo's encoder, minus the audio track — a deck has no
 * music bed.
 */
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export interface EncodeRequest {
  width: number
  height: number
  fps: number
  /** Called with each decoded frame index as it is encoded. */
  onProgress?: (frameIndex: number) => void
}

/** Whether this runtime can encode at all. */
export function canEncodeVideo(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { VideoEncoder?: unknown }).VideoEncoder === 'function' &&
    typeof createImageBitmap === 'function'
  )
}

/** H.264 level chosen from frame size — high enough for 4K, honest for SD. */
function avcCodecString(width: number, height: number): string {
  const pixels = width * height
  if (pixels > 1920 * 1080) return 'avc1.640033' // High 5.1
  if (pixels > 1280 * 720) return 'avc1.640028' // High 4.0
  return 'avc1.4d0028' // Main 4.0
}

function bitrateFor(width: number, height: number, fps: number): number {
  // ~0.1 bits per pixel per frame keeps text and flat colour clean without
  // producing files nobody can email.
  return Math.round(width * height * fps * 0.1)
}

/**
 * Encode a frame sequence into MP4 bytes.
 *
 * Frames are pulled one at a time through `loadFrame` rather than passed in
 * as an array: a minute of 720p is eighteen hundred PNGs, and holding them
 * all in memory to hand to the encoder would be the one thing that makes a
 * long export fail.
 */
export async function encodeFramesToMp4(
  frameCount: number,
  loadFrame: (index: number) => Promise<string>,
  request: EncodeRequest,
): Promise<Uint8Array> {
  if (!canEncodeVideo()) {
    throw new Error('this runtime has no VideoEncoder')
  }
  if (frameCount <= 0) throw new Error('there are no frames to encode')

  const { width, height, fps } = request
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height },
    fastStart: 'in-memory',
  })

  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: error => {
      encoderError = error instanceof Error ? error : new Error(String(error))
    },
  })

  encoder.configure({
    codec: avcCodecString(width, height),
    width,
    height,
    bitrate: bitrateFor(width, height, fps),
    framerate: fps,
  })

  const frameDuration = Math.round(1e6 / fps)
  for (let index = 0; index < frameCount; index += 1) {
    if (encoderError) throw encoderError
    const response = await fetch(await loadFrame(index))
    const bitmap = await createImageBitmap(await response.blob())
    const videoFrame = new VideoFrame(bitmap, {
      timestamp: index * frameDuration,
      duration: frameDuration,
    })
    // A keyframe every two seconds keeps the file seekable in players.
    encoder.encode(videoFrame, { keyFrame: index % (fps * 2) === 0 })
    videoFrame.close()
    bitmap.close()
    request.onProgress?.(index)
    // Let the encoder drain so long exports do not balloon memory.
    if (encoder.encodeQueueSize > fps) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  await encoder.flush()
  encoder.close()
  if (encoderError) throw encoderError

  muxer.finalize()

  const { buffer } = muxer.target as ArrayBufferTarget
  return new Uint8Array(buffer)
}

/** Base64 for the binary bridge write, chunked so large files do not blow the stack. */
export function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    )
  }
  return btoa(binary)
}
