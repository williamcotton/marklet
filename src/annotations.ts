import type { CalloutOptions } from './callouts'

export type Point = { x: number; y: number }
export type Tool = 'select' | 'box' | 'highlight' | 'arrow' | 'text' | 'callout'
export type MarkTool = Exclude<Tool, 'select'>
export type Style = { color: string; weight: number; opacity: number }
type MarkFields = {
  id: string
  from: Point
  to: Point
  style: Style
  text: string
  label: string
}
export type CalloutMark = MarkFields & { type: 'callout'; callout: CalloutOptions }
export type Mark = CalloutMark | (MarkFields & { type: Exclude<MarkTool, 'callout'> })

type Endpoint = 'from' | 'to'
export type ResizeHandle = {
  x: Endpoint
  y: Endpoint
  position: Point
  cursor: 'crosshair' | 'nwse-resize' | 'nesw-resize'
}

export const toolNames: Record<Tool, string> = {
  select: 'Select', box: 'Rectangle', highlight: 'Highlight', arrow: 'Arrow', text: 'Text', callout: 'Callout',
}

export const palette = [
  { name: 'Vermilion', hex: '#db5038' },
  { name: 'Marigold', hex: '#f5ca48' },
  { name: 'Moss', hex: '#54775d' },
  { name: 'Blue', hex: '#4879cc' },
  { name: 'Ink', hex: '#282722' },
  { name: 'White', hex: '#ffffff' },
]

export const defaultStyles: Record<MarkTool, Style> = {
  box: { color: palette[0].hex, weight: 4, opacity: 100 },
  highlight: { color: palette[1].hex, weight: 4, opacity: 46 },
  arrow: { color: palette[0].hex, weight: 4, opacity: 100 },
  text: { color: palette[4].hex, weight: 32, opacity: 100 },
  callout: { color: palette[1].hex, weight: 3, opacity: 100 },
}

export type Rectangle = { x: number; y: number; width: number; height: number }

export function contains({ x, y, width, height }: Rectangle, point: Point, tolerance = 0) {
  return point.x >= x - tolerance && point.x <= x + width + tolerance
    && point.y >= y - tolerance && point.y <= y + height + tolerance
}

const fontFamily = 'Arial, sans-serif'

function textBounds(ctx: CanvasRenderingContext2D, mark: Mark) {
  const lines = mark.text.split('\n')
  ctx.save()
  ctx.font = `600 ${mark.style.weight}px ${fontFamily}`
  const width = Math.max(...lines.map(line => ctx.measureText(line).width))
  ctx.restore()

  return { x: mark.from.x, y: mark.from.y, width, height: lines.length * mark.style.weight * 1.2 }
}

export function bounds(ctx: CanvasRenderingContext2D, mark: Mark) {
  if (mark.type === 'text') return textBounds(ctx, mark)
  return {
    x: Math.min(mark.from.x, mark.to.x),
    y: Math.min(mark.from.y, mark.to.y),
    width: Math.abs(mark.from.x - mark.to.x),
    height: Math.abs(mark.from.y - mark.to.y),
  }
}

function segmentDistance(point: Point, from: Point, to: Point) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const squared = dx * dx + dy * dy
  const t = squared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / squared)) : 0
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy)
}

function arrowHead(mark: Mark): [Point, Point] {
  const angle = Math.atan2(mark.to.y - mark.from.y, mark.to.x - mark.from.x)
  const length = Math.min(
    Math.max(14, mark.style.weight * 4),
    Math.hypot(mark.to.x - mark.from.x, mark.to.y - mark.from.y) * .55,
  )
  return [-.52, .52].map(offset => ({
    x: mark.to.x - length * Math.cos(angle + offset),
    y: mark.to.y - length * Math.sin(angle + offset),
  })) as [Point, Point]
}

export function hitsMark(ctx: CanvasRenderingContext2D, mark: Mark, point: Point, tolerance: number) {
  if (mark.type === 'arrow') {
    const [left, right] = arrowHead(mark)
    return Math.min(
      segmentDistance(point, mark.from, mark.to),
      segmentDistance(point, mark.to, left),
      segmentDistance(point, mark.to, right),
    ) <= tolerance + mark.style.weight / 2
  }

  return contains(bounds(ctx, mark), point, tolerance)
}

export function drawMark(ctx: CanvasRenderingContext2D, mark: Exclude<Mark, CalloutMark>) {
  const { type, from, to, style } = mark
  ctx.save()
  ctx.globalAlpha = style.opacity / 100
  ctx.strokeStyle = style.color
  ctx.fillStyle = style.color
  ctx.lineWidth = style.weight
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (type === 'box') {
    ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y)
  } else if (type === 'highlight') {
    ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y)
  } else if (type === 'arrow') {
    const [left, right] = arrowHead(mark)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.moveTo(left.x, left.y)
    ctx.lineTo(to.x, to.y)
    ctx.lineTo(right.x, right.y)
    ctx.stroke()
  } else {
    ctx.font = `600 ${style.weight}px ${fontFamily}`
    ctx.textBaseline = 'top'
    mark.text.split('\n').forEach((line, index) => {
      ctx.fillText(line, from.x, from.y + style.weight * 1.2 * index)
    })
  }

  ctx.restore()
}

export function resizeHandles(mark: Mark, scale: number, imageSize: Point): ResizeHandle[] {
  if (mark.type === 'text') return []
  const insetX = Math.min(6 / scale, imageSize.x / 2)
  const insetY = Math.min(6 / scale, imageSize.y / 2)
  const diagonal = (mark.from.x <= mark.to.x) === (mark.from.y <= mark.to.y)
  const make = (x: Endpoint, y: Endpoint): ResizeHandle => ({
    x,
    y,
    position: {
      x: Math.max(insetX, Math.min(imageSize.x - insetX, mark[x].x)),
      y: Math.max(insetY, Math.min(imageSize.y - insetY, mark[y].y)),
    },
    cursor: mark.type === 'arrow' ? 'crosshair'
      : (x === y) === diagonal ? 'nwse-resize' : 'nesw-resize',
  })
  return mark.type === 'arrow' ? [make('from', 'from'), make('to', 'to')]
    : [make('from', 'from'), make('to', 'from'), make('to', 'to'), make('from', 'to')]
}

export function resizeMark(mark: Mark, handle: ResizeHandle, delta: Point, imageSize: Point): Mark {
  const updated = { ...mark, from: { ...mark.from }, to: { ...mark.to } }
  if (delta.x) updated[handle.x].x = Math.max(0, Math.min(imageSize.x, mark[handle.x].x + delta.x))
  if (delta.y) updated[handle.y].y = Math.max(0, Math.min(imageSize.y, mark[handle.y].y + delta.y))
  return updated
}

export function drawSelection(ctx: CanvasRenderingContext2D, mark: Mark, scale: number, imageSize: Point, inset?: Rectangle) {
  ctx.save()
  ctx.strokeStyle = '#3565bd'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 1.5 / scale
  if (mark.type !== 'arrow') {
    const { x, y, width, height } = bounds(ctx, mark)
    const padding = mark.type === 'text' ? 4 / scale : 0
    ctx.setLineDash([4 / scale, 3 / scale])
    ctx.strokeRect(x - padding, y - padding, width + padding * 2, height + padding * 2)
    if (inset) {
      const gap = 4 / scale
      ctx.strokeRect(inset.x - gap, inset.y - gap, inset.width + gap * 2, inset.height + gap * 2)
    }
    ctx.setLineDash([])
  }
  const half = 4.5 / scale
  for (const { position } of resizeHandles(mark, scale, imageSize)) {
    if (mark.type === 'arrow') {
      ctx.beginPath()
      ctx.arc(position.x, position.y, half, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.fillRect(position.x - half, position.y - half, half * 2, half * 2)
      ctx.strokeRect(position.x - half, position.y - half, half * 2, half * 2)
    }
  }
  ctx.restore()
}

export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  return {
    ...mark,
    from: { x: mark.from.x + dx, y: mark.from.y + dy },
    to: { x: mark.to.x + dx, y: mark.to.y + dy },
  }
}
