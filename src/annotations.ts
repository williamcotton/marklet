export type Point = { x: number; y: number }
export type Tool = 'select' | 'box' | 'highlight' | 'arrow' | 'text'
export type MarkTool = Exclude<Tool, 'select'>
export type Style = { color: string; weight: number; opacity: number }
export type Mark = {
  id: string
  type: MarkTool
  from: Point
  to: Point
  style: Style
  text: string
  label: string
}

export const toolNames: Record<Tool, string> = {
  select: 'Select', box: 'Rectangle', highlight: 'Highlight', arrow: 'Arrow', text: 'Text',
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

  const { x, y, width, height } = bounds(ctx, mark)
  return point.x >= x - tolerance && point.x <= x + width + tolerance
    && point.y >= y - tolerance && point.y <= y + height + tolerance
}

export function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
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

export function drawSelection(ctx: CanvasRenderingContext2D, mark: Mark, scale: number) {
  const { x, y, width, height } = bounds(ctx, mark)
  const padding = Math.max(5 / scale, mark.type === 'box' || mark.type === 'arrow' ? mark.style.weight : 0)
  ctx.save()
  ctx.strokeStyle = '#3565bd'
  ctx.lineWidth = 1.25 / scale
  ctx.setLineDash([4 / scale, 3 / scale])
  ctx.strokeRect(x - padding, y - padding, width + padding * 2, height + padding * 2)
  ctx.restore()
}

export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  return {
    ...mark,
    from: { x: mark.from.x + dx, y: mark.from.y + dy },
    to: { x: mark.to.x + dx, y: mark.to.y + dy },
  }
}
