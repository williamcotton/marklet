import '@fontsource-variable/dm-sans'
import '@fontsource/instrument-serif/400.css'
import './style.css'
import { defaultStyles, drawMark, drawSelection, hitsMark, moveMark, toolNames, type Mark, type MarkTool, type Point, type Style, type Tool } from './annotations'
import { createDemo } from './demo'
import { icon, toolIcons } from './icons'
import { asDataUrl, download, filenameFor, loadImage, projectBlob, readProject, toImageBlob, type Project } from './project'
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
const toolButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tool]')]
const swatchButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-color]')]
const uploadButtons = ['upload-image', 'empty-upload'].map(id => element<HTMLButtonElement>(id))

const past: Project[] = []
const future: Project[] = []
const styles = structuredClone(defaultStyles)
let project: Project | undefined
let savedProject: Project | undefined
let sampleSource: string | undefined
let image: HTMLImageElement | undefined
let activeTool: Tool = 'box'
let selectedId: string | undefined
let zoom: number | undefined
let displayScale = 1
let loading = false
let openRequest = 0
let toastTimer: number | undefined

type Gesture = {
  pointerId: number
  start: Point
  end: Point
  mark: Mark
  moving: boolean
}
let gesture: Gesture | undefined
let textEdit: { point: Point; mark?: Mark } | undefined

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
  const fitScale = Math.min(1, Math.max(1, area.clientWidth - gutter) / image.naturalWidth, Math.max(1, area.clientHeight - verticalGutter) / image.naturalHeight)
  displayScale = zoom ?? fitScale
  const width = Math.max(1, Math.round(image.naturalWidth * displayScale))
  const height = Math.max(1, Math.round(image.naturalHeight * displayScale))
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
  ctx.scale(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
  ctx.drawImage(image, 0, 0)

  for (const mark of project.marks) {
    drawMark(ctx, gesture?.moving && gesture.mark.id === mark.id ? gesture.mark : mark)
  }
  if (gesture && !gesture.moving) drawMark(ctx, gesture.mark)

  const selection = gesture?.moving ? gesture.mark : selectedMark()
  if (selection) drawSelection(ctx, selection, displayScale)
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
  element('sample-badge').hidden = !project || project.imageSrc !== sampleSource
  element('image-size').textContent = image ? `${image.naturalWidth} × ${image.naturalHeight} px` : '—'
  element('document-state').textContent = project
    ? project !== savedProject ? 'Unsaved changes' : 'Saved'
    : loading ? 'Opening file…' : 'No project'
  element('document-state').classList.toggle('unsaved', !!project && project !== savedProject)

  setDisabled(['save-project', 'export-image', 'rename-project', 'zoom-fit'], !project)
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
  canvas.className = activeTool === 'select' ? 'cursor-select' : activeTool === 'text' ? 'cursor-text' : 'cursor-draw'
  if (!current) return

  element('style-context').textContent = selection ? markLabel(selection) : `${toolNames[current.type]} tool`
  for (const button of swatchButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.color === current.style.color))
    button.disabled = !project
  }
  element('weight-control').hidden = current.type === 'highlight'
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
  return mark.label || (mark.type === 'text' ? mark.text.split('\n')[0] : toolNames[mark.type])
}

function renderLayers() {
  const marks = project?.marks ?? []
  element('layer-count').textContent = String(marks.length)
  element('layers-empty').hidden = marks.length > 0
  const rows = marks.map(mark => {
    const row = document.createElement('li')
    row.className = 'layer-row'
    const selected = mark.id === selectedId
    row.classList.toggle('is-selected', selected)
    const label = markLabel(mark)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'layer-select'
    button.setAttribute('aria-pressed', String(selected))
    const badge = document.createElement('span')
    badge.className = 'layer-icon'
    badge.dataset.kind = mark.type
    badge.innerHTML = icon(toolIcons[mark.type])
    const title = document.createElement('span')
    title.className = 'layer-label'
    title.textContent = label
    button.append(badge, title)
    button.onclick = () => {
      select(mark.id)
      element('layers').querySelectorAll<HTMLButtonElement>('.layer-select')[marks.indexOf(mark)]?.focus()
    }
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'icon-button layer-remove'
    remove.setAttribute('aria-label', `Delete ${label}`)
    remove.title = 'Delete annotation'
    remove.innerHTML = icon('trash')
    remove.onclick = () => removeMark(mark.id, true)
    row.append(button, remove)
    return row
  })
  element('layers').replaceChildren(...rows)
}

function update() {
  renderHeader()
  renderStyle()
  renderLayers()
  paint()
}

function commit(next: Project) {
  if (!project) return
  past.push(project)
  if (past.length > 100) past.shift()
  future.length = 0
  project = next
  update()
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
  const index = project.marks.findIndex(mark => mark.id === id)
  if (selectedId === id) selectedId = undefined
  commit({ ...project, marks: project.marks.filter(mark => mark.id !== id) })
  if (focusLayer) {
    const buttons = element('layers').querySelectorAll<HTMLButtonElement>('.layer-select')
    const target = buttons[Math.min(index, buttons.length - 1)] ?? element<HTMLButtonElement>('shortcuts')
    target.focus()
  }
}

function changeStyle(properties: Partial<Style>) {
  const current = activeStyle()
  if (!project || !current) return
  if (Object.entries(properties).every(([key, value]) => current.style[key as keyof Style] === value)) return
  const style = { ...current.style, ...properties }
  const mark = selectedMark()
  if (mark) commit({ ...project, marks: project.marks.map(item => item.id === mark.id ? { ...item, style } : item) })
  else {
    styles[current.type] = style
    renderStyle()
  }
}

function makeMark(type: MarkTool, from: Point, to: Point, text = ''): Mark {
  return { type, from, to, style: { ...styles[type] }, text, id: crypto.randomUUID(), label: '' }
}

function rename() {
  if (!project) return
  const value = projectName.value.trim() || 'Untitled project'
  projectName.value = value
  if (value !== project.name) commit({ ...project, name: value })
  else renderHeader()
}

function installProject(next: Project, nextImage: HTMLImageElement) {
  project = next
  savedProject = next
  image = nextImage
  past.length = 0
  future.length = 0
  selectedId = undefined
  activeTool = 'box'
  gesture = undefined
  zoom = undefined
  update()
  resizeCanvas()
  area.scrollTo(0, 0)
}

async function openFile(file: File, kind?: 'image' | 'project') {
  const isProject = kind ? kind === 'project' : /\.(marklet|json)$/i.test(file.name)
  if (project && project !== savedProject && !window.confirm('Replace this project and discard unsaved changes?')) return
  const previous = project
  const request = ++openRequest
  loading = true
  renderHeader()
  try {
    const next: Project = isProject
      ? readProject(await file.text())
      : { name: file.name.replace(/\.[^.]+$/, '') || 'Untitled project', imageName: file.name || 'Pasted image', imageSrc: await asDataUrl(file), marks: [] }
    const decoded = await loadImage(next.imageSrc)
    if (request !== openRequest) return
    if (project !== previous && project !== savedProject && !window.confirm('Discard the changes made while opening this file?')) return
    installProject(next, decoded)
    if (!isProject) {
      savedProject = undefined
      renderHeader()
    }
    notify(isProject ? 'Project opened' : 'Image opened')
  } catch {
    if (request === openRequest) {
      notify(isProject ? 'Could not open this Marklet project.' : 'Could not open this image. Try a PNG, JPEG, or WebP.')
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
    const decoded = await loadImage(example.imageSrc)
    if (request !== openRequest) return
    sampleSource = example.imageSrc
    installProject(example, decoded)
  } catch {
    if (request !== openRequest) return
    element('empty-message').textContent = 'Drop an image or project here'
    element('empty-upload').hidden = false
    renderHeader()
  }
}

function saveProject() {
  if (!project) return
  rename()
  download(projectBlob(project), `${filenameFor(project.name)}.marklet`)
  savedProject = project
  renderHeader()
  notify('Project downloaded')
}

function openExport() {
  if (!image) return
  element('export-size').textContent = `${image.naturalWidth} × ${image.naturalHeight} px · Includes all annotations`
  exportDialog.showModal()
}

async function exportImage(event: Event) {
  event.preventDefault()
  if (!project || !image) return
  const button = element<HTMLButtonElement>('export-submit')
  const type = element<HTMLSelectElement>('export-format').value
  const exportCanvas = document.createElement('canvas')
  exportCanvas.width = image.naturalWidth
  exportCanvas.height = image.naturalHeight
  button.disabled = true
  try {
    const exportContext = exportCanvas.getContext('2d')
    if (!exportContext) throw new Error('Image exceeds this browser’s canvas limits.')
    if (type === 'image/jpeg') {
      exportContext.fillStyle = '#ffffff'
      exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    }
    exportContext.drawImage(image, 0, 0)
    project.marks.forEach(mark => drawMark(exportContext, mark))
    const name = filenameFor(project.name)
    const blob = await toImageBlob(exportCanvas, type)
    download(blob, `${name}.${blob.type === 'image/jpeg' ? 'jpg' : 'png'}`)
    exportDialog.close()
    notify('Image downloaded')
  } catch {
    notify('Could not export the image at its original size.')
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
  else if (mark.text !== value) commit({
    ...project,
    marks: project.marks.map(item => item.id === mark.id ? { ...item, text: value, label: '' } : item),
  })
  textDialog.close()
}

function pointFrom(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * image!.naturalWidth,
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * image!.naturalHeight,
  }
}

function beginGesture(event: PointerEvent) {
  if (!image || !project || gesture || !event.isPrimary || event.button !== 0) return
  event.preventDefault()
  const start = pointFrom(event)
  if (activeTool === 'text') {
    openText(start)
    return
  }
  const moving = activeTool === 'select'
  const mark = moving
    ? project.marks.findLast(item => hitsMark(ctx, item, start, 6 / displayScale))
    : makeMark(activeTool as Exclude<MarkTool, 'text'>, start, start)
  if (moving) select(mark?.id)
  if (!mark) return
  gesture = { pointerId: event.pointerId, start, end: start, mark, moving }
  canvas.setPointerCapture(event.pointerId)
}

function continueGesture(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const end = pointFrom(event)
  if (gesture.moving) gesture.mark = moveMark(gesture.mark, end.x - gesture.end.x, end.y - gesture.end.y)
  else gesture.mark = { ...gesture.mark, to: end }
  gesture.end = end
  paint()
}

function finishGesture(event: PointerEvent, canceled = false) {
  if (!gesture || !project || event.pointerId !== gesture.pointerId) return
  if (!canceled) continueGesture(event)
  const { end, start, mark, moving } = gesture
  gesture = undefined
  const width = Math.abs(end.x - start.x) * displayScale
  const height = Math.abs(end.y - start.y) * displayScale
  const enough = moving || mark.type === 'arrow' ? Math.hypot(width, height) >= 3 : width >= 3 && height >= 3
  if (!canceled && enough) {
    const marks = moving ? project.marks.map(item => item.id === mark.id ? mark : item) : [...project.marks, mark]
    commit({ ...project, marks })
  } else paint()
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
