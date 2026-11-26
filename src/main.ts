import '@fontsource-variable/dm-sans'
import '@fontsource-variable/inter'
import { fitsDisplayImage, imageLimits } from '@evidenceworks/document'
import './style.css'
import { contains, defaultStyles, drawMark, drawSelection, hitsMark, moveMark, resizeHandles, resizeMark, toolNames, type Mark, type MarkTool, type Point, type ResizeHandle, type Style, type Tool } from './annotations'
import { calloutSource, clampPoint, compositionSize, defaultCallout, drawComposition, layoutCallout, magnifications, moveCalloutSource, validCrop, type CalloutOptions } from './callouts'
import { createDemo } from './demo'
import { icon, toolIcons } from './icons'
import { installLayerDrag } from './layer-drag'
import { download, filenameFor, imageProject, loadProjectImage, projectBlob, readProject, toImageBlob, type Project } from './project'
import { editorMarkup, shortcutByTool } from './view'

document.querySelector('#app')!.innerHTML = editorMarkup

function element<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

const canvas = element<HTMLCanvasElement>('artboard')
const ctx = canvas.getContext('2d')!
const area = element('canvas-area')
const stage = element('canvas-stage')
const shell = element('canvas-shell')
const projectName = element<HTMLInputElement>('project-name')
const opacity = element<HTMLInputElement>('opacity')
const imageInput = element<HTMLInputElement>('image-input')
const projectInput = element<HTMLInputElement>('project-input')
const textDialog = element<HTMLDialogElement>('text-dialog')
const textField = element<HTMLTextAreaElement>('annotation-text')
const exportDialog = element<HTMLDialogElement>('export-dialog')
const sourceDialog = element<HTMLDialogElement>('source-dialog')
const layerList = element<HTMLUListElement>('layers')
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')]
const swatchButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-color]')]
const variantButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-callout-variant]')]
const magnificationButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-callout-zoom]')]
const uploadButtons = ['upload-image', 'empty-upload'].map(id => element<HTMLButtonElement>(id))

const past: Project[] = []
const future: Project[] = []
const styles = structuredClone(defaultStyles)
let project: Project | undefined
let savedProject: Project | undefined
let sampleId: string | undefined
let image: HTMLImageElement | undefined
let outputSize: Point = { x: 0, y: 0 }
let activeTool: Tool = 'box'
let nextCallout = { ...defaultCallout }
let selectedId: string | undefined
let zoom: number | undefined
let displayScale = 1
let loading = false
let saving = false
let openRequest = 0
let toastTimer: number | undefined

type Gesture = {
  pointerId: number
  start: Point
  end: Point
  original: Mark
  mark: Mark
  mode: 'draw' | 'move' | 'inset' | ResizeHandle
}
let gesture: Gesture | undefined
let textEdit: { point: Point; mark?: Mark } | undefined

function imageSize() {
  return { x: image!.naturalWidth, y: image!.naturalHeight }
}

function selectedMark() {
  return project?.marks.find(mark => mark.id === selectedId)
}

function activeStyle() {
  const selected = selectedMark()
  if (selected) return { type: selected.type, style: selected.style }
  if (activeTool !== 'select') return { type: activeTool, style: styles[activeTool] }
}

function notify(message: string) {
  const toast = element('toast')
  toast.textContent = message
  toast.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { toast.hidden = true }, 3800)
}

function resizeCanvas() {
  if (!image || !area.clientWidth || !area.clientHeight) return
  const gutter = area.clientWidth < 500 ? 30 : 96
  const verticalGutter = area.clientHeight < 400 ? 32 : 64
  const fitScale = Math.min(1, Math.max(1, area.clientWidth - gutter) / outputSize.x, Math.max(1, area.clientHeight - verticalGutter) / outputSize.y)
  displayScale = zoom ?? fitScale
  const width = Math.max(1, Math.round(outputSize.x * displayScale))
  const height = Math.max(1, Math.round(outputSize.y * displayScale))
  shell.style.width = `${width}px`
  shell.style.height = `${height}px`
  stage.style.minWidth = `${width + gutter}px`
  stage.style.minHeight = `max(100%, ${height + verticalGutter}px)`

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2, 4096 / width, 4096 / height, Math.sqrt(12e6 / width / height))
  canvas.width = Math.max(1, Math.round(width * pixelRatio))
  canvas.height = Math.max(1, Math.round(height * pixelRatio))
  element('zoom-value').textContent = `${Math.round(displayScale * 100)}%`
  element('zoom-fit').classList.toggle('is-fit', zoom === undefined)
  element<HTMLButtonElement>('zoom-in').disabled = displayScale >= 1.99
  element<HTMLButtonElement>('zoom-out').disabled = displayScale <= .051
  paint()
}

function paint() {
  if (!image || !project) return
  ctx.resetTransform()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(canvas.width / outputSize.x, canvas.height / outputSize.y)
  const marks = gesture && gesture.mode !== 'draw'
    ? project.marks.map(mark => mark.id === gesture?.mark.id ? gesture.mark : mark) : project.marks
  drawComposition(ctx, image, marks, outputSize, false)

  if (gesture?.mode === 'draw') {
    if (gesture.mark.type === 'callout') {
      const { x, y, width, height } = calloutSource(gesture.mark, imageSize())
      ctx.save()
      ctx.strokeStyle = gesture.mark.style.color
      ctx.lineWidth = 2 / displayScale
      ctx.setLineDash([6 / displayScale, 4 / displayScale])
      ctx.strokeRect(x, y, width, height)
      ctx.restore()
    } else drawMark(ctx, gesture.mark)
  }

  const selection = gesture && gesture.mode !== 'draw' ? gesture.mark : selectedMark()
  if (selection) {
    const inset = selection.type === 'callout' ? layoutCallout(selection, imageSize()).inset : undefined
    drawSelection(ctx, selection, displayScale, selection.type === 'callout' ? imageSize() : outputSize, inset)
  }
}

function setDisabled(ids: string[], disabled: boolean) {
  for (const id of ids) element<HTMLButtonElement>(id).disabled = disabled
}

function sizeProjectName() {
  const style = getComputedStyle(projectName)
  ctx.save()
  ctx.font = style.font
  ctx.letterSpacing = style.letterSpacing
  projectName.style.width = `${Math.ceil(ctx.measureText(projectName.value).width) + 2}px`
  ctx.restore()
}

function renderHeader() {
  const name = project?.name ?? 'Untitled project'
  if (document.activeElement !== projectName) projectName.value = name
  sizeProjectName()
  projectName.disabled = !project
  element('image-name').textContent = project?.imageName ?? 'No image loaded'
  element('sample-badge').hidden = !project || project.id !== sampleId
  element('image-size').textContent = image ? `${outputSize.x} × ${outputSize.y} px` : '—'
  element('document-state').textContent = project
    ? project !== savedProject ? 'Unsaved changes' : 'Saved'
    : loading ? 'Opening file…' : 'No project'
  element('document-state').classList.toggle('unsaved', !!project && project !== savedProject)

  setDisabled(['save-project', 'export-image', 'rename-project', 'zoom-fit'], !project)
  element<HTMLButtonElement>('save-project').disabled = !project || saving
  element<HTMLButtonElement>('source-details').disabled = !project
  if (!project) setDisabled(['zoom-in', 'zoom-out'], true)
  setDisabled(['undo'], !past.length)
  setDisabled(['redo'], !future.length)
  for (const button of toolButtons) button.disabled = !project
  shell.hidden = !image
  element('empty-state').hidden = !!image
}

function renderStyle() {
  const current = activeStyle()
  const selection = selectedMark()
  for (const button of toolButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === activeTool))
  }
  element('style-fields').hidden = !current
  element('style-empty').hidden = !!current
  element('style-context').hidden = !current
  const editHint = element('annotation-edit-hint')
  editHint.hidden = !selection && activeTool !== 'callout'
  if (!selection) editHint.textContent = 'Draw a box around the area to magnify.'
  else {
    editHint.textContent = selection.type === 'callout' ? 'Drag either box to move it. Resize the source with its corner handles.'
      : selection.type === 'arrow' ? 'Drag to move, or drag an endpoint to adjust.'
      : selection.type === 'text' ? 'Drag to move.'
      : 'Drag to move, or drag a corner to resize.'
  }
  canvas.className = activeTool === 'select' ? 'cursor-select' : activeTool === 'text' ? 'cursor-text' : 'cursor-draw'
  if (!current) return

  element('style-context').textContent = selection ? markLabel(selection) : `${toolNames[current.type]} tool`
  for (const button of swatchButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.color === current.style.color))
    button.disabled = !project
  }
  const callout = selection?.type === 'callout' ? selection.callout : nextCallout
  element('callout-controls').hidden = current.type !== 'callout'
  element('auto-place-inset').hidden = selection?.type !== 'callout'
  element<HTMLButtonElement>('auto-place-inset').disabled = !callout.position
  for (const button of variantButtons) {
    button.disabled = !project
    button.setAttribute('aria-pressed', String(button.dataset.calloutVariant === callout.variant))
  }
  for (const button of magnificationButtons) {
    button.disabled = !project
    button.setAttribute('aria-pressed', String(Number(button.dataset.calloutZoom) === callout.magnification))
  }
  element('weight-control').hidden = current.type === 'highlight' || current.type === 'callout'
  element('opacity-control').hidden = current.type === 'callout'
  element('weight-label').textContent = current.type === 'text' ? 'Text size' : 'Stroke width'
  const weights = current.type === 'text' ? [16, 24, 32, 48] : [2, 4, 6, 8]
  if (!weights.includes(current.style.weight)) weights.push(current.style.weight)
  element('weights').innerHTML = weights.map(weight => `
    <button type="button" data-weight="${weight}" aria-pressed="${weight === current.style.weight}" ${project ? '' : 'disabled'}>${weight} px</button>
  `).join('')
  opacity.disabled = !project
  opacity.value = String(current.style.opacity)
  element('opacity-value').textContent = `${current.style.opacity}%`
  opacity.style.setProperty('--opacity', `${current.style.opacity}%`)
  element('edit-text').hidden = selection?.type !== 'text'
}

function markLabel(mark: Mark) {
  return mark.label || (mark.type === 'text' ? mark.text.split('\n')[0] : '') || toolNames[mark.type]
}

function createLayerRow(mark: Mark) {
  const id = mark.id
  const row = document.createElement('li')
  row.className = 'layer-row'
  row.dataset.layerId = id
  const grip = document.createElement('button')
  grip.type = 'button'
  grip.className = 'icon-button layer-grip'
  grip.title = 'Drag to reorder. Use Up or Down when focused.'
  grip.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown')
  grip.innerHTML = icon('grip')
  grip.onkeydown = event => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const index = [...layerList.children].indexOf(row)
    event.preventDefault()
    reorderLayer(id, index + (event.key === 'ArrowUp' ? -1 : 1))
  }
  const selectButton = document.createElement('button')
  selectButton.type = 'button'
  selectButton.className = 'layer-select'
  selectButton.innerHTML = `<span class="layer-icon" data-kind="${mark.type}">${icon(toolIcons[mark.type])}</span>`
  selectButton.onclick = () => select(id)

  const name = document.createElement('div')
  name.className = 'layer-name'
  const renameButton = document.createElement('button')
  renameButton.type = 'button'
  renameButton.className = 'layer-rename'
  const title = document.createElement('span')
  title.className = 'layer-label'
  renameButton.append(title)
  renameButton.insertAdjacentHTML('beforeend', icon('pen'))

  const input = document.createElement('input')
  input.className = 'layer-name-input'
  input.setAttribute('aria-label', 'Annotation name')
  input.maxLength = 100
  input.hidden = true
  renameButton.onclick = () => {
    const current = project?.marks.find(item => item.id === id)
    if (!current) return
    select(id)
    input.value = markLabel(current)
    renameButton.hidden = true
    input.hidden = false
    input.focus()
    input.select()
  }
  function finishRename(cancel: boolean) {
    if (input.hidden) return
    const current = project?.marks.find(item => item.id === id)
    const value = input.value.trim()
    renameButton.hidden = false
    input.hidden = true
    if (!cancel && current && value !== markLabel(current) && value !== current.label) patchMark(id, { label: value })
  }
  input.onblur = () => finishRename(false)
  input.onkeydown = event => {
    if (event.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return
    event.preventDefault()
    finishRename(event.key === 'Escape')
    renameButton.focus()
  }
  name.append(renameButton, input)

  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'icon-button layer-remove'
  remove.title = 'Delete annotation'
  remove.innerHTML = icon('trash')
  remove.onclick = () => removeMark(id, true)
  row.append(grip, selectButton, name, remove)
  return { row, grip, selectButton, renameButton, title, remove }
}

const layerRows = new Map<string, ReturnType<typeof createLayerRow>>()

function renderLayers() {
  // The renderer and project format store the backmost layer first.
  const marks = project?.marks.toReversed() ?? []
  element('layer-count').textContent = String(marks.length)
  element('layers-empty').hidden = marks.length > 0
  element('layers-reorder-hint').hidden = marks.length < 2
  const ids = new Set(marks.map(mark => mark.id))
  for (const [id, layer] of layerRows) {
    if (ids.has(id)) continue
    layer.row.remove()
    layerRows.delete(id)
  }
  marks.forEach((mark, index) => {
    const layer = layerRows.get(mark.id) ?? createLayerRow(mark)
    layerRows.set(mark.id, layer)
    const selected = mark.id === selectedId
    const label = markLabel(mark)
    layer.row.classList.toggle('is-selected', selected)
    layer.grip.disabled = marks.length < 2
    layer.grip.setAttribute('aria-label', `Reorder ${label}`)
    layer.selectButton.setAttribute('aria-pressed', String(selected))
    layer.selectButton.setAttribute('aria-label', `Select ${label}`)
    layer.selectButton.title = `Select ${label}`
    layer.renameButton.setAttribute('aria-label', `Rename ${label}`)
    layer.renameButton.title = `Rename ${label}`
    layer.title.textContent = label
    layer.remove.setAttribute('aria-label', `Delete ${label}`)
    if (layerList.children[index] !== layer.row) layerList.insertBefore(layer.row, layerList.children[index] ?? null)
  })
}

function update(forceResize = false) {
  const size = image && project ? compositionSize(project.marks, imageSize()) : outputSize
  const resized = size.x !== outputSize.x || size.y !== outputSize.y
  outputSize = size
  renderHeader()
  renderStyle()
  renderLayers()
  if (resized || forceResize) resizeCanvas()
  else paint()
}

function commit(next: Project) {
  if (!project) return
  past.push(project)
  if (past.length > 100) past.shift()
  future.length = 0
  project = next
  update()
}

function patchMark(id: string, changes: Partial<Pick<Mark, 'label' | 'text' | 'style' | 'from' | 'to'>> & { callout?: CalloutOptions }) {
  if (!project?.marks.some(mark => mark.id === id)) return
  commit({ ...project, marks: project.marks.map(mark => mark.id === id ? { ...mark, ...changes } : mark) })
}

function historyStep(isRedo: boolean) {
  const from = isRedo ? future : past
  const to = isRedo ? past : future
  const previous = from.pop()
  if (!previous || !project) return
  to.push(project)
  project = previous
  if (!selectedMark()) selectedId = undefined
  update()
}

function select(id?: string) {
  selectedId = id
  if (id) activeTool = 'select'
  renderStyle()
  renderLayers()
  paint()
}

function useTool(tool: Tool) {
  if (!project) return
  activeTool = tool
  selectedId = undefined
  renderStyle()
  renderLayers()
  paint()
}

function removeMark(id: string, focusLayer = false) {
  if (!project) return
  const index = project.marks.length - 1 - project.marks.findIndex(mark => mark.id === id)
  if (selectedId === id) selectedId = undefined
  commit({ ...project, marks: project.marks.filter(mark => mark.id !== id) })
  if (focusLayer) {
    const buttons = layerList.querySelectorAll<HTMLButtonElement>('.layer-select')
    const target = buttons[Math.min(index, buttons.length - 1)] ?? element<HTMLButtonElement>('shortcuts')
    target.focus()
  }
}

function reorderLayer(id: string, topIndex: number) {
  if (!project) return
  const from = project.marks.findIndex(mark => mark.id === id)
  const to = project.marks.length - 1 - topIndex
  if (from < 0 || to < 0 || to >= project.marks.length || from === to) return
  const marks = [...project.marks]
  const [mark] = marks.splice(from, 1)
  marks.splice(to, 0, mark)
  const grip = layerRows.get(id)?.grip
  const restoreFocus = document.activeElement === grip
  commit({ ...project, marks })
  if (restoreFocus && grip) {
    grip.focus({ preventScroll: true })
    grip.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  notify(`${markLabel(mark)} moved to layer ${topIndex + 1} of ${marks.length}`)
}

const cancelLayerDrag = installLayerDrag(layerList, reorderLayer)

function changeStyle(properties: Partial<Style>) {
  const current = activeStyle()
  if (!project || !current) return
  if (Object.entries(properties).every(([key, value]) => current.style[key as keyof Style] === value)) return
  const style = { ...current.style, ...properties }
  const mark = selectedMark()
  if (mark) patchMark(mark.id, { style })
  else {
    styles[current.type] = style
    renderStyle()
  }
}

function makeMark(type: MarkTool, from: Point, to: Point, text = ''): Mark {
  const base = { from, to, style: { ...styles[type] }, text, id: crypto.randomUUID(), label: '' }
  return type === 'callout' ? { ...base, type, callout: { ...nextCallout } } : { ...base, type }
}

function changeCallout(properties: Partial<CalloutOptions>) {
  const mark = selectedMark()
  if (mark?.type === 'callout') {
    const callout = { ...mark.callout, ...properties }
    if (Object.keys(properties).some(key => callout[key as keyof CalloutOptions] !== mark.callout[key as keyof CalloutOptions])) {
      patchMark(mark.id, { callout })
    }
  } else {
    nextCallout = { ...nextCallout, ...properties }
    renderStyle()
  }
}

function rename() {
  if (!project) return
  const value = projectName.value.trim() || 'Untitled project'
  projectName.value = value
  if (value !== project.name) commit({ ...project, name: value })
  else renderHeader()
}

function installProject(next: Project, nextImage: HTMLImageElement) {
  cancelLayerDrag()
  layerList.replaceChildren()
  layerRows.clear()
  project = next
  savedProject = next
  image = nextImage
  past.length = 0
  future.length = 0
  selectedId = undefined
  activeTool = next.marks.length ? 'box' : 'callout'
  gesture = undefined
  zoom = undefined
  update(true)
  area.scrollTo(0, 0)
}

async function openFile(file: File, kind?: 'image' | 'project') {
  const isProject = kind ? kind === 'project' : /\.(marklet|webstamp|juxtapose)$/i.test(file.name)
  if (project && project !== savedProject && !window.confirm('Replace this project and discard unsaved changes?')) return
  const previous = project
  const request = ++openRequest
  loading = true
  renderHeader()
  try {
    const { project: next, native } = isProject ? await readProject(file) : {
      project: await imageProject(file, file.name.replace(/\.[^.]+$/, '') || 'Untitled project', file.name || 'Pasted image'),
      native: false,
    }
    const decoded = await loadProjectImage(next)
    if (request !== openRequest) return
    if (project !== previous && project !== savedProject && !window.confirm('Discard the changes made while opening this file?')) return
    installProject(next, decoded)
    if (!native) {
      savedProject = undefined
      renderHeader()
    }
    notify(native ? 'Project opened' : isProject ? 'Evidence opened in a new project' : 'Image opened')
  } catch (error) {
    if (request === openRequest) {
      notify(isProject && error instanceof Error ? error.message : 'Could not open this image. Try a PNG, JPEG, or WebP.')
    }
  } finally {
    if (request === openRequest) {
      loading = false
      element('empty-message').textContent = 'Drop an image or project here'
      element('empty-upload').hidden = false
      renderHeader()
    }
  }
}

async function openExample() {
  const request = openRequest
  try {
    const example = await createDemo()
    const decoded = await loadProjectImage(example)
    if (request !== openRequest) return
    sampleId = example.id
    installProject(example, decoded)
    select(example.marks[0]?.id)
  } catch {
    if (request !== openRequest) return
    element('empty-message').textContent = 'Drop an image or project here'
    element('empty-upload').hidden = false
    renderHeader()
  }
}

async function renderImage(source: HTMLImageElement, marks: Mark[], size: Point, type: string, width = size.x, height = size.y) {
  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const context = output.getContext('2d')
  if (!context) throw new Error('Image exceeds this browser’s canvas limits.')
  context.scale(width / size.x, height / size.y)
  drawComposition(context, source, marks, size, type === 'image/jpeg')
  return toImageBlob(output, type)
}

async function saveProject() {
  if (!project || !image || saving) return
  if (document.activeElement instanceof HTMLInputElement && layerList.contains(document.activeElement)) document.activeElement.blur()
  rename()
  const snapshot = project
  const source = image
  const size = compositionSize(snapshot.marks, imageSize())
  const request = openRequest
  saving = true
  renderHeader()
  try {
    let scale = Math.min(1, imageLimits.side / size.x, imageLimits.side / size.y, Math.sqrt(imageLimits.pixels / (size.x * size.y)))
    for (let attempt = 0; attempt < 10; attempt++) {
      const width = Math.max(1, Math.floor(size.x * scale))
      const height = Math.max(1, Math.floor(size.y * scale))
      const rendered = await renderImage(source, snapshot.marks, size, 'image/png', width, height)
      if (fitsDisplayImage(rendered.size, width, height)) {
        download(await projectBlob(snapshot, rendered), `${filenameFor(snapshot.name)}.marklet`)
        if (openRequest === request) savedProject = snapshot
        notify('Project downloaded')
        return
      }
      scale *= .7
    }
    throw new Error('Could not create a handoff image within the display limits.')
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not save the project.')
  } finally {
    saving = false
    renderHeader()
  }
}

function openExport() {
  if (!image) return
  element('export-size').textContent = `${outputSize.x} × ${outputSize.y} px · Includes all annotations`
  element('export-error').hidden = true
  exportDialog.showModal()
}

const editableSource = (current: Project) => current.assets.find(asset =>
  asset.id === current.canvasEntryId && !asset.origin && asset.provenance?.type === 'imported-image')

function openSourceDetails() {
  if (!project) return
  const summary = element('source-summary')
  summary.replaceChildren()
  for (const entry of project.assets) {
    const provenance = entry.provenance
    const fields: [string, unknown][] = [
      ['Source', provenance?.filename ?? provenance?.title ?? entry.path],
      ['URL', provenance?.url],
      ['Captured', provenance?.capturedAt],
      ['Time zone', provenance?.timezone],
      ['Repository path', provenance?.repositoryPath],
      ['Commit', provenance?.commit],
      ['Source description', provenance?.userSupplied?.description],
      ['Production identifier', provenance?.userSupplied?.productionId],
    ]
    for (const [label, value] of fields) {
      if (typeof value !== 'string' || !value) continue
      const term = document.createElement('dt')
      const detail = document.createElement('dd')
      term.textContent = label
      detail.textContent = value
      summary.append(term, detail)
    }
  }
  const source = editableSource(project)
  element('source-form').hidden = !source
  const user = source?.provenance?.userSupplied
  element<HTMLTextAreaElement>('source-description').value = typeof user?.description === 'string' ? user.description : ''
  element<HTMLInputElement>('source-production').value = typeof user?.productionId === 'string' ? user.productionId : ''
  sourceDialog.showModal()
}

element('source-details').onclick = openSourceDetails
element('source-form').onsubmit = event => {
  event.preventDefault()
  if (!project) return
  const source = editableSource(project)
  if (!source?.provenance) return
  const description = element<HTMLTextAreaElement>('source-description').value.trim()
  const productionId = element<HTMLInputElement>('source-production').value.trim()
  const provenance = { ...source.provenance, userSupplied: { ...(description ? { description } : {}), ...(productionId ? { productionId } : {}) } }
  commit({ ...project, assets: project.assets.map(entry => entry === source ? { ...entry, provenance } : entry) })
  sourceDialog.close()
}

async function exportImage(event: Event) {
  event.preventDefault()
  if (!project || !image) return
  const button = element<HTMLButtonElement>('export-submit')
  const type = element<HTMLSelectElement>('export-format').value
  const error = element('export-error')
  error.hidden = true
  button.disabled = true
  try {
    const name = filenameFor(project.name)
    const blob = await renderImage(image, project.marks, outputSize, type)
    download(blob, `${name}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`)
    exportDialog.close()
    notify('Image downloaded')
  } catch {
    error.textContent = 'Could not export at these dimensions.'
    error.hidden = false
  } finally {
    button.disabled = false
  }
}

function openText(point: Point, mark?: Mark) {
  textEdit = { point, mark }
  element('text-title').textContent = mark ? 'Edit text' : 'Add text'
  element('text-submit').textContent = mark ? 'Save text' : 'Add text'
  textField.value = mark?.text ?? ''
  textField.setCustomValidity('')
  textDialog.showModal()
  textField.focus()
}

function saveText(event: Event) {
  event.preventDefault()
  if (!project || !textEdit) return
  const value = textField.value.trim()
  if (!value) {
    textField.setCustomValidity('Enter a note to add it to the image.')
    textField.reportValidity()
    return
  }
  const { point, mark } = textEdit
  if (!mark) commit({ ...project, marks: [...project.marks, makeMark('text', point, point, value)] })
  else if (mark.text !== value) patchMark(mark.id, { text: value })
  textDialog.close()
}

function pointFrom(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect()
  return clampPoint({
    x: (event.clientX - rect.left) / rect.width * outputSize.x,
    y: (event.clientY - rect.top) / rect.height * outputSize.y,
  }, outputSize)
}

function handleAt(mark: Mark, point: Point, pointerType: string) {
  let closest: ResizeHandle | undefined
  let distance = (pointerType === 'touch' ? 15 : 8) / displayScale
  for (const handle of resizeHandles(mark, displayScale, mark.type === 'callout' ? imageSize() : outputSize)) {
    const candidate = Math.hypot(point.x - handle.position.x, point.y - handle.position.y)
    if (candidate > distance) continue
    closest = handle
    distance = candidate
  }
  return closest
}

function beginGesture(event: PointerEvent) {
  if (!image || !project || gesture || !event.isPrimary || event.button !== 0) return
  event.preventDefault()
  if (document.activeElement instanceof HTMLInputElement && layerList.contains(document.activeElement)) document.activeElement.blur()
  const start = pointFrom(event)
  if (activeTool === 'text') {
    openText(start)
    return
  }
  let mode: Gesture['mode'] = 'draw'
  let mark: Mark | undefined
  if (activeTool === 'select') {
    const selected = selectedMark()
    const handle = selected && handleAt(selected, start, event.pointerType)
    if (handle) {
      mode = handle
      mark = selected
    } else {
      mode = 'move'
      const tolerance = 6 / displayScale
      mark = project.marks.findLast(item => {
        if (item.type !== 'callout') return hitsMark(ctx, item, start, tolerance)
        const { source, inset } = layoutCallout(item, imageSize())
        return validCrop(source) && (contains(inset, start, tolerance) || contains(source, start, tolerance))
      })
      if (mark?.type === 'callout' && contains(layoutCallout(mark, imageSize()).inset, start, tolerance)) mode = 'inset'
    }
    select(mark?.id)
  } else {
    if (activeTool === 'callout' && (start.x > imageSize().x || start.y > imageSize().y)) return
    mark = makeMark(activeTool, start, start)
  }
  if (!mark) return
  gesture = { pointerId: event.pointerId, start, end: start, original: mark, mark, mode }
  canvas.setPointerCapture(event.pointerId)
}

function continueGesture(event: PointerEvent) {
  if (!gesture) {
    const mark = image && selectedMark()
    canvas.style.cursor = mark ? handleAt(mark, pointFrom(event), event.pointerType)?.cursor ?? '' : ''
    return
  }
  if (event.pointerId !== gesture.pointerId) return
  const { start, original, mode } = gesture
  const end = pointFrom(event)
  const delta = { x: end.x - start.x, y: end.y - start.y }
  if (mode === 'draw') {
    gesture.mark = { ...original, to: original.type === 'callout' ? clampPoint(end, imageSize()) : end }
  } else if (mode === 'move') {
    gesture.mark = original.type === 'callout' ? moveCalloutSource(original, delta, imageSize()) : moveMark(original, delta.x, delta.y)
  } else if (mode === 'inset') {
    if (original.type !== 'callout') return
    const { inset } = layoutCallout(original, imageSize())
    const position = clampPoint({ x: inset.x + delta.x, y: inset.y + delta.y }, outputSize)
    const next = { ...original, callout: { ...original.callout, position } }
    const placed = layoutCallout(next, imageSize()).inset
    next.callout.position = { x: placed.x, y: placed.y }
    gesture.mark = gesture.mark.type === 'callout' && placed.x === inset.x && placed.y === inset.y ? original : next
  } else {
    gesture.mark = resizeMark(original, mode, delta, original.type === 'callout' ? imageSize() : outputSize)
  }
  gesture.end = end
  paint()
}

function finishGesture(event: PointerEvent, canceled = false) {
  if (!gesture || !project || event.pointerId !== gesture.pointerId) return
  if (!canceled) continueGesture(event)
  const { end, start, mark, mode, original } = gesture
  gesture = undefined
  canvas.style.cursor = ''
  const width = Math.abs(end.x - start.x) * displayScale
  const height = Math.abs(end.y - start.y) * displayScale
  const enough = mode !== 'draw' || mark.type === 'arrow' ? Math.hypot(width, height) >= 3 : width >= 3 && height >= 3
  const changed = mode === 'inset' ? original !== mark : original.from.x !== mark.from.x || original.from.y !== mark.from.y
    || original.to.x !== mark.to.x || original.to.y !== mark.to.y
  const usableCrop = mark.type !== 'callout' || validCrop(calloutSource(mark, imageSize()))
  if (canceled || !enough || !changed || !usableCrop) {
    paint()
  } else if (mode === 'draw') {
    if (mark.type === 'callout') {
      selectedId = mark.id
      activeTool = 'select'
    }
    commit({ ...project, marks: [...project.marks, mark] })
  } else if (mode === 'inset' && mark.type === 'callout') {
    patchMark(mark.id, { callout: mark.callout })
  } else {
    patchMark(mark.id, { from: mark.from, to: mark.to })
  }
}

function zoomBy(multiplier: number) {
  if (!image) return
  const oldScale = displayScale
  const centerX = (area.scrollLeft + area.clientWidth / 2 - shell.offsetLeft) / shell.clientWidth
  const centerY = (area.scrollTop + area.clientHeight / 2 - shell.offsetTop) / shell.clientHeight
  zoom = Math.max(.02, Math.min(2, oldScale * multiplier))
  resizeCanvas()
  area.scrollTo(shell.offsetLeft + centerX * shell.clientWidth - area.clientWidth / 2, shell.offsetTop + centerY * shell.clientHeight - area.clientHeight / 2)
}

function fit() {
  zoom = undefined
  resizeCanvas()
  area.scrollTo(0, 0)
}

for (const button of uploadButtons) button.onclick = () => imageInput.click()
element('open-project').onclick = () => projectInput.click()
element('save-project').onclick = saveProject
element('export-image').onclick = openExport
element('export-form').addEventListener('submit', exportImage)
element('text-form').addEventListener('submit', saveText)
textField.oninput = () => textField.setCustomValidity('')
textDialog.onclose = () => { textEdit = undefined }
element('edit-text').onclick = () => {
  const mark = selectedMark()
  if (mark?.type === 'text') openText(mark.from, mark)
}

for (const [input, kind] of [[imageInput, 'image'], [projectInput, 'project']] as const) {
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void openFile(file, kind)
    input.value = ''
  }
}

for (const button of toolButtons) button.onclick = () => useTool(button.dataset.tool as Tool)
for (const button of swatchButtons) button.onclick = () => {
  changeStyle({ color: button.dataset.color! })
}
for (const button of variantButtons) button.onclick = () => {
  changeCallout({ variant: button.dataset.calloutVariant as CalloutOptions['variant'] })
}
for (const button of magnificationButtons) button.onclick = () => {
  const magnification = magnifications.find(value => value === Number(button.dataset.calloutZoom))
  if (magnification) changeCallout({ magnification })
}
element('auto-place-inset').onclick = () => changeCallout({ position: undefined })
element('weights').onclick = event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-weight]')
  if (button) {
    changeStyle({ weight: Number(button.dataset.weight) })
    element('weights').querySelector<HTMLButtonElement>(`[data-weight="${button.dataset.weight}"]`)?.focus()
  }
}
opacity.oninput = () => {
  element('opacity-value').textContent = `${opacity.value}%`
  opacity.style.setProperty('--opacity', `${opacity.value}%`)
}
opacity.onchange = () => changeStyle({ opacity: Number(opacity.value) })
element('rename-project').onclick = () => {
  projectName.focus()
  projectName.select()
}
projectName.onchange = rename
projectName.oninput = sizeProjectName
projectName.onkeydown = event => {
  if (event.key === 'Enter') projectName.blur()
  if (event.key === 'Escape' && project) {
    projectName.value = project.name
    projectName.blur()
  }
}

element('undo').onclick = () => historyStep(false)
element('redo').onclick = () => historyStep(true)
element('zoom-out').onclick = () => zoomBy(1 / 1.25)
element('zoom-in').onclick = () => zoomBy(1.25)
element('zoom-fit').onclick = fit
element('shortcuts').onclick = () => element<HTMLDialogElement>('shortcuts-dialog').showModal()
for (const close of document.querySelectorAll<HTMLButtonElement>('[data-close]')) {
  close.onclick = () => close.closest('dialog')?.close()
}

canvas.onpointerdown = beginGesture
canvas.onpointermove = continueGesture
canvas.onpointerup = event => finishGesture(event)
canvas.onpointercancel = event => finishGesture(event, true)
canvas.onlostpointercapture = event => finishGesture(event, true)
canvas.onpointerleave = () => { if (!gesture) canvas.style.cursor = '' }

let dragEntries = 0
document.addEventListener('dragenter', event => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  dragEntries++
  element('drop-overlay').hidden = false
})
document.addEventListener('dragover', event => {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
})
document.addEventListener('dragleave', () => {
  dragEntries = Math.max(0, dragEntries - 1)
  if (!dragEntries) element('drop-overlay').hidden = true
})
document.addEventListener('drop', event => {
  const file = event.dataTransfer?.files[0]
  if (!file) return
  event.preventDefault()
  dragEntries = 0
  element('drop-overlay').hidden = true
  if (!document.querySelector('dialog[open]')) void openFile(file)
})
document.addEventListener('paste', event => {
  if (document.querySelector('dialog[open]')) return
  const imageItem = [...(event.clipboardData?.items ?? [])].find(item => item.type.startsWith('image/'))
  const pasted = imageItem?.getAsFile()
  if (pasted) {
    event.preventDefault()
    void openFile(pasted, 'image')
  }
})

document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return
  if (gesture) {
    if (event.key === 'Escape') {
      event.preventDefault()
      canvas.releasePointerCapture(gesture.pointerId)
    }
    return
  }
  const key = event.key.toLowerCase()
  const modifier = event.metaKey || event.ctrlKey
  if (modifier && key === 's' && project) {
    event.preventDefault()
    saveProject()
    return
  }
  if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return
  if (modifier && (key === 'z' || key === 'y')) {
    event.preventDefault()
    historyStep(key === 'y' || event.shiftKey)
    return
  }
  if (modifier || event.altKey || event.isComposing) return
  const tool = (Object.keys(shortcutByTool) as Tool[]).find(choice => shortcutByTool[choice].toLowerCase() === key)
  if (tool) useTool(tool)
  else if ((key === 'delete' || key === 'backspace') && selectedId) {
    event.preventDefault()
    removeMark(selectedId)
  } else if (key === 'escape') select()
  else if (key === '0') fit()
  else if (key === '?') element<HTMLDialogElement>('shortcuts-dialog').showModal()
})

window.addEventListener('beforeunload', event => {
  if (project && project !== savedProject) event.preventDefault()
})

new ResizeObserver(resizeCanvas).observe(area)
update()
void openExample()
