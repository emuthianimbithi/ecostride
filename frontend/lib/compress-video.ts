"use client"

// Single-threaded ffmpeg.wasm. No SharedArrayBuffer / COOP+COEP needed.
// Slower than multi-threaded, but works in every modern browser without
// requiring cross-origin isolation that would break image embeds.

import type { FFmpeg } from "@ffmpeg/ffmpeg"

const CORE_VERSION = "0.12.10"
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`

let instance: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null

async function getFfmpeg(): Promise<FFmpeg> {
  if (instance) return instance
  if (loading) return loading

  loading = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util")
    ])
    const ff = new FFmpeg()
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm")
    })
    instance = ff
    return ff
  })()

  return loading
}

export type CompressOptions = {
  /** Called with progress 0..1 during transcode. */
  onProgress?: (ratio: number) => void
  /** Cap output height in pixels. Width scales to keep aspect. Default 720. */
  maxHeight?: number
  /** x264 CRF (lower = bigger + better, higher = smaller). Default 28. */
  crf?: number
}

export function isCompressibleVideo(file: File): boolean {
  return file.type.startsWith("video/")
}

/**
 * Transcode a video File to H.264/AAC mp4 in the browser.
 * Returns a new File. On any failure, throws — callers should fall back to original.
 */
export async function compressVideo(file: File, opts: CompressOptions = {}): Promise<File> {
  const { onProgress, maxHeight = 720, crf = 28 } = opts
  const ff = await getFfmpeg()
  const { fetchFile } = await import("@ffmpeg/util")

  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"
  const stamp = Date.now()
  const inputName = `in_${stamp}.${ext}`
  const outputName = `out_${stamp}.mp4`

  const onProg = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.max(0, Math.min(1, progress)))
  }
  ff.on("progress", onProg)

  try {
    await ff.writeFile(inputName, await fetchFile(file))
    await ff.exec([
      "-i", inputName,
      "-vf", `scale=-2:'min(${maxHeight}\\,ih)'`,
      "-c:v", "libx264",
      "-crf", String(crf),
      "-preset", "veryfast",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      outputName
    ])
    const data = (await ff.readFile(outputName)) as Uint8Array
    const baseName = file.name.replace(/\.[^.]+$/, "")
    const out = new File([data], `${baseName}.mp4`, { type: "video/mp4" })
    return out
  } finally {
    ff.off("progress", onProg)
    await ff.deleteFile(inputName).catch(() => {})
    await ff.deleteFile(outputName).catch(() => {})
  }
}
