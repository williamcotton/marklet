import { archiveLimits, imageDimensions, openArchive, readJson, sha256, writeArchive, type Asset, type Manifest, type Representation, type Snapshot } from '@evidenceworks/document'
import { toolNames, type Mark } from './annotations'
import { calloutVariants, magnifications } from './callouts'

export type Project = {
  id: string
  createdAt: string
  annotationId: string
  name: string
  imageName: string
  canvasEntryId: string
  assets: Asset[]
  representations: Representation[]
  files: Snapshot['files']
  marks: Mark[]
}

function newProject(name: string, imageName: string, canvasEntryId: string, assets: Asset[], representations: Representation[], files: Snapshot['files']): Project {
  return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), annotationId: crypto.randomUUID(),
    name, imageName, canvasEntryId, assets, representations, files, marks: [] }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function validPoint(value: unknown) {
  return record(value) && bounded(value.x, -1e7, 1e7) && bounded(value.y, -1e7, 1e7)
}

function validCallout(value: unknown) {
  return record(value)
    && typeof value.variant === 'string' && Object.hasOwn(calloutVariants, value.variant)
    && magnifications.some(zoom => zoom === value.magnification)
    && (value.position === undefined || (record(value.position)
      && bounded(value.position.x, 0, 1e7) && bounded(value.position.y, 0, 1e7)))
}

function validMark(value: unknown): value is Mark {
  return record(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.type === 'string' && value.type !== 'select' && Object.hasOwn(toolNames, value.type)
    && typeof value.text === 'string' && value.text.length <= 1500
    && typeof value.label === 'string'
    && validPoint(value.from) && validPoint(value.to)
    && record(value.style)
    && typeof value.style.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.style.color)
    && bounded(value.style.weight, 1, 200) && bounded(value.style.opacity, 0, 100)
    && (value.type !== 'callout' || validCallout(value.callout))
}

export async function imageProject(file: Blob, name: string, imageName: string): Promise<Project> {
  if (!file.size || file.size > archiveLimits.payload) throw new Error('Choose a nonempty image no larger than 160 MiB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const asset: Asset = {
    id: 'image', path: 'assets/image', mediaType: file.type || 'application/octet-stream', sha256: await sha256(bytes),
    provenance: { type: 'imported-image', filename: imageName, importedAt: new Date().toISOString(), attribution: 'recorded', recordedBy: 'marklet' },
  }
  return newProject(name, imageName, asset.id, [asset], [], new Map([[asset.path, bytes]]))
}

export async function readProject(file: File) {
  if (file.size > archiveLimits.bytes) throw new Error('The project archive exceeds the document limits.')
  const archive = await openArchive(new Uint8Array(await file.arrayBuffer()))
  const { manifest, readPath } = archive
  const { application, formatVersion, title, id, createdAt } = manifest.document
  if (application !== 'marklet') {
    if (application !== 'webstamp' && application !== 'juxtapose') {
      throw new Error('Choose a Webstamp, Juxtapose, or Marklet document.')
    }
    const snapshot = await archive.readSnapshot()
    const files = new Map([...snapshot.files].map(([path, bytes]) => [`imports/${path}`, bytes]))
    const relocated = <Entry extends Asset | Representation>(entry: Entry): Entry => ({ ...entry, path: `imports/${entry.path}` })
    return { native: false, project: newProject(title || file.name, file.name, snapshot.defaultRepresentation,
      snapshot.assets.map(relocated), snapshot.representations.map(relocated), files) }
  }

  if (formatVersion !== 3) throw new Error('This file uses an unsupported Marklet format.')
  const state = readJson(await readPath('document.json', archiveLimits.manifest), 'Marklet editor state')
  if (!record(state) || typeof state.imageName !== 'string' || typeof state.canvasEntryId !== 'string'
    || !Array.isArray(state.marks) || !state.marks.every(validMark)
    || new Set(state.marks.map(mark => mark.id)).size !== state.marks.length) {
    throw new Error('This file has invalid Marklet editor state.')
  }
  const snapshot = await archive.readSnapshot()
  const annotation = manifest.representations.find(entry => entry.id === snapshot.defaultRepresentation)!
  if (annotation.derivedFrom.length !== 1 || annotation.derivedFrom[0] !== state.canvasEntryId) {
    throw new Error('The saved image does not refer to the Marklet canvas.')
  }
  const files = new Map(snapshot.files)
  const assetIds = new Set(snapshot.assets.map(entry => entry.id))
  const representationIds = new Set(snapshot.representations.map(entry => entry.id))
  const assets = manifest.assets.filter(entry => assetIds.has(entry.id))
  const representations = manifest.representations.filter(entry => representationIds.has(entry.id) && entry.id !== annotation.id)
  if (![...assets, ...representations].some(entry => entry.path === annotation.path)) files.delete(annotation.path)
  return {
    native: true,
    project: { id, createdAt, name: title, annotationId: annotation.id, imageName: state.imageName, canvasEntryId: state.canvasEntryId,
      assets, representations, files, marks: state.marks } satisfies Project,
  }
}

export async function projectBlob(project: Project, composition: Blob) {
  const bytes = new Uint8Array(await composition.arrayBuffer())
  const path = `representations/${project.annotationId}.png`
  const annotation: Representation = {
    id: project.annotationId, path, label: 'Annotated image', mediaType: 'image/png',
    ...imageDimensions(bytes, 'image/png'), sha256: await sha256(bytes), derivedFrom: [project.canvasEntryId],
  }
  const manifest: Manifest = {
    protocol: 'evidence-works', protocolVersion: 1,
    document: { application: 'marklet', formatVersion: 3, id: project.id, title: project.name,
      createdAt: project.createdAt, modifiedAt: new Date().toISOString() },
    assets: project.assets, representations: [...project.representations, annotation], defaultRepresentation: annotation.id,
  }
  const files = new Map(project.files)
  files.set(path, bytes)
  const { imageName, canvasEntryId, marks } = project
  const state = new TextEncoder().encode(JSON.stringify({ imageName, canvasEntryId, marks }))
  if (state.length > archiveLimits.manifest) throw new Error('The Marklet editor state is too large to save.')
  files.set('document.json', state)
  return new Blob([await writeArchive(manifest, files)], { type: 'application/zip' })
}

export async function loadProjectImage(project: Project): Promise<HTMLImageElement> {
  const entry = [...project.assets, ...project.representations].find(entry => entry.id === project.canvasEntryId)
  const bytes = entry && project.files.get(entry.path)
  if (!entry || !bytes) throw new Error('The original canvas image is missing.')
  const url = URL.createObjectURL(new Blob([bytes], { type: entry.mediaType }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (entry.width !== undefined && entry.height !== undefined
      && (image.naturalWidth !== entry.width || image.naturalHeight !== entry.height)) {
      throw new Error('The canvas image dimensions do not match its manifest.')
    }
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
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
