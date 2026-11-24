import type { Mark, Tool } from './annotations'

export type Project = {
  name: string
  imageName: string
  imageSrc: string
  marks: Mark[]
}

const projectFormat = 'marklet'
const projectVersion = 1
const dataImage = /^data:image\/[a-z0-9.+-]+;base64,/i
const markTools = new Set<Tool>(['box', 'highlight', 'arrow', 'text'])

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function validPoint(value: unknown) {
  return record(value) && bounded(value.x, -1e7, 1e7) && bounded(value.y, -1e7, 1e7)
}

function validMark(value: unknown): value is Mark {
  return record(value)
    && typeof value.id === 'string' && value.id.length > 0
    && markTools.has(value.type as Tool)
    && typeof value.text === 'string' && value.text.length <= 1500
    && typeof value.label === 'string'
    && validPoint(value.from) && validPoint(value.to)
    && record(value.style)
    && typeof value.style.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.style.color)
    && bounded(value.style.weight, 1, 200) && bounded(value.style.opacity, 0, 100)
}

export function readProject(json: string): Project {
  const parsed: unknown = JSON.parse(json)
  if (!record(parsed) || parsed.format !== projectFormat || parsed.version !== projectVersion
    || typeof parsed.name !== 'string' || typeof parsed.imageName !== 'string'
    || typeof parsed.imageSrc !== 'string' || !dataImage.test(parsed.imageSrc)
    || !Array.isArray(parsed.marks) || !parsed.marks.every(validMark)
    || new Set(parsed.marks.map(mark => mark.id)).size !== parsed.marks.length) {
    throw new Error('This file is not a supported Marklet project.')
  }
  return { name: parsed.name, imageName: parsed.imageName, imageSrc: parsed.imageSrc, marks: parsed.marks }
}

export function projectBlob(project: Project) {
  return new Blob([JSON.stringify({ format: projectFormat, version: projectVersion, ...project })], { type: 'application/json' })
}

export function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = src
  await image.decode()
  return image
}

export function toImageBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('The browser could not export this image.'))
    }, type, .94)
  })
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function filenameFor(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/\.+$/, '').trim() || 'marklet'
}
