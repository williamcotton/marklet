import { drawMark, type CalloutMark, type Mark, type Point, type Rectangle } from './annotations'

export const calloutVariants = {
  connected: 'Connected',
  spotlight: 'Spotlight',
  shaded: 'Shaded',
  '3d': '3D',
}
export const magnifications = [1.5, 2, 3, 4] as const

export type CalloutOptions = {
  variant: keyof typeof calloutVariants
  magnification: typeof magnifications[number]
  position?: Point
}

export const defaultCallout: CalloutOptions = { variant: 'connected', magnification: 2 }

type CalloutLayout = { source: Rectangle; inset: Rectangle }
type CalloutDrawing = CalloutLayout & { mark: CalloutMark }

export function clampPoint(point: Point, size: Point): Point {
  return { x: Math.max(0, Math.min(size.x, point.x)), y: Math.max(0, Math.min(size.y, point.y)) }
}

export function calloutSource(mark: CalloutMark, size: Point): Rectangle {
  const from = clampPoint(mark.from, size)
  const to = clampPoint(mark.to, size)
  return { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) }
}

function gapFor(size: Point) {
  return Math.max(12, Math.round(Math.min(size.x, size.y) * .027))
}

function overlaps(a: Rectangle, b: Rectangle, gap: number) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}

function placeAutomatically(source: Rectangle, inset: Rectangle, size: Point, gap: number): Point {
  const centerX = source.x + (source.width - inset.width) / 2
  const centerY = source.y + (source.height - inset.height) / 2
  const x = Math.max(gap, Math.min(size.x - inset.width - gap, centerX))
  const y = Math.max(gap, Math.min(size.y - inset.height - gap, centerY))
  const candidates = [
    { x: source.x + source.width + gap, y },
    { x: source.x - inset.width - gap, y },
    { x, y: source.y + source.height + gap },
    { x, y: source.y - inset.height - gap },
  ]
  const inside = candidates.find(point => point.x >= gap && point.y >= gap
    && point.x + inset.width + gap <= size.x && point.y + inset.height + gap <= size.y)
  if (inside) return inside

  const right = { x: size.x + gap, y }
  const below = { x, y: size.y + gap }
  const cost = (point: Point) => Math.max(size.x, point.x + inset.width + gap) * Math.max(size.y, point.y + inset.height + gap)
  return cost(right) <= cost(below) ? right : below
}

export function layoutCallout(mark: CalloutMark, size: Point): CalloutLayout {
  const source = calloutSource(mark, size)
  const gap = gapFor(size)
  const inset = { x: 0, y: 0, width: source.width * mark.callout.magnification, height: source.height * mark.callout.magnification }
  const requested = mark.callout.position
  if (!requested) return { source, inset: { ...inset, ...placeAutomatically(source, inset, size, gap) } }
  Object.assign(inset, requested)
  if (!overlaps(source, inset, gap)) return { source, inset }

  // Keep both versions of the crop visible when the inset is dragged across the source.
  const positions = [
    { x: source.x + source.width + gap, y: inset.y },
    { x: source.x - inset.width - gap, y: inset.y },
    { x: inset.x, y: source.y + source.height + gap },
    { x: inset.x, y: source.y - inset.height - gap },
  ].filter(point => point.x >= 0 && point.y >= 0)
  const distance = (point: Point) => Math.hypot(point.x - requested.x, point.y - requested.y)
  return { source, inset: { ...inset, ...positions.reduce((best, point) => distance(point) < distance(best) ? point : best) } }
}

export function validCrop({ width, height }: Rectangle) {
  return width >= 1 && height >= 1
}

export function compositionSize(marks: Mark[], original: Point): Point {
  const size = { ...original }
  const gap = gapFor(original)
  for (const mark of marks) {
    if (mark.type !== 'callout') continue
    const { source, inset } = layoutCallout(mark, original)
    if (!validCrop(source)) continue
    const right = inset.x + inset.width + mark.style.weight / 2
    const bottom = inset.y + inset.height + mark.style.weight / 2
    if (right > original.x) size.x = Math.max(size.x, Math.ceil(right + gap))
    if (bottom > original.y) size.y = Math.max(size.y, Math.ceil(bottom + gap))
  }
  return size
}

export function moveCalloutSource(mark: CalloutMark, delta: Point, size: Point): CalloutMark {
  const source = calloutSource(mark, size)
  const next = clampPoint({ x: source.x + delta.x, y: source.y + delta.y }, { x: size.x - source.width, y: size.y - source.height })
  const dx = next.x - source.x
  const dy = next.y - source.y
  return { ...mark, from: { x: mark.from.x + dx, y: mark.from.y + dy }, to: { x: mark.to.x + dx, y: mark.to.y + dy } }
}

function facingEdges(source: Rectangle, inset: Rectangle): [Point, Point, Point, Point] {
  if (inset.x >= source.x + source.width || inset.x + inset.width <= source.x) {
    const sourceLeft = inset.x >= source.x + source.width
    const a = sourceLeft ? source.x + source.width : source.x
    const b = sourceLeft ? inset.x : inset.x + inset.width
    return [{ x: a, y: source.y }, { x: a, y: source.y + source.height },
      { x: b, y: inset.y }, { x: b, y: inset.y + inset.height }]
  }
  const sourceAbove = inset.y >= source.y + source.height
  const a = sourceAbove ? source.y + source.height : source.y
  const b = sourceAbove ? inset.y : inset.y + inset.height
  return [{ x: source.x, y: a }, { x: source.x + source.width, y: a },
    { x: inset.x, y: b }, { x: inset.x + inset.width, y: b }]
}

function corners({ x, y, width, height }: Rectangle) {
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }]
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function convexHull(points: Point[]) {
  const ordered = points.toSorted((a, b) => a.x - b.x || a.y - b.y)
  const trace = (vertices: Point[]) => {
    const edge: Point[] = []
    for (const point of vertices) {
      while (edge.length >= 2) {
        const a = edge[edge.length - 2]
        const b = edge[edge.length - 1]
        const turn = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
        if (turn > 0) break
        edge.pop()
      }
      edge.push(point)
    }
    return edge.slice(0, -1)
  }
  return [...trace(ordered), ...trace(ordered.reverse())]
}

function drawDepthConnector(ctx: CanvasRenderingContext2D, source: Rectangle, inset: Rectangle, color: string) {
  const start = corners(source)
  const end = corners(inset)
  const hull = convexHull([...start, ...end])
  const [a, b, c, d] = facingEdges(source, inset)
  const from = midpoint(a, b)
  const to = midpoint(c, d)
  const fade = () => ctx.createLinearGradient(from.x, from.y, to.x, to.y)
  const face = fade()
  face.addColorStop(0, `${color}09`)
  face.addColorStop(1, `${color}4d`)
  const edges = fade()
  edges.addColorStop(0, `${color}70`)
  edges.addColorStop(1, `${color}e6`)

  ctx.save()
  // Cut the connector around both crops so the screenshot pixels stay legible.
  const left = Math.min(source.x, inset.x)
  const top = Math.min(source.y, inset.y)
  const right = Math.max(source.x + source.width, inset.x + inset.width)
  const bottom = Math.max(source.y + source.height, inset.y + inset.height)
  const padding = ctx.lineWidth
  ctx.beginPath()
  ctx.rect(left - padding, top - padding, right - left + padding * 2, bottom - top + padding * 2)
  ctx.rect(source.x, source.y, source.width, source.height)
  ctx.rect(inset.x, inset.y, inset.width, inset.height)
  ctx.clip('evenodd')

  ctx.beginPath()
  ctx.moveTo(hull[0].x, hull[0].y)
  for (const point of hull.slice(1)) ctx.lineTo(point.x, point.y)
  ctx.closePath()
  ctx.fillStyle = face
  ctx.fill()

  ctx.beginPath()
  for (const [index, point] of start.entries()) {
    ctx.moveTo(point.x, point.y)
    ctx.lineTo(end[index].x, end[index].y)
  }
  ctx.strokeStyle = edges
  ctx.stroke()
  ctx.restore()
}

function drawCallout(ctx: CanvasRenderingContext2D, image: HTMLImageElement, { mark, source, inset }: CalloutDrawing) {
  const { variant } = mark.callout
  const { color, weight } = mark.style
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = weight
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (variant === '3d') {
    drawDepthConnector(ctx, source, inset, color)
  } else if (variant === 'shaded') {
    const [a, b, c, d] = facingEdges(source, inset)
    ctx.fillStyle = color
    ctx.globalAlpha = .24
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(d.x, d.y)
    ctx.lineTo(c.x, c.y)
    ctx.closePath()
    ctx.fill()
    ctx.globalAlpha = .10
    ctx.fillRect(source.x, source.y, source.width, source.height)
    ctx.globalAlpha = 1
  } else {
    const [a, b, c, d] = facingEdges(source, inset)
    const from = midpoint(a, b)
    const to = midpoint(c, d)
    if (variant === 'spotlight') ctx.setLineDash([weight * 3, weight * 2])
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.setLineDash([])
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(inset.x, inset.y, inset.width, inset.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, source.x, source.y, source.width, source.height, inset.x, inset.y, inset.width, inset.height)
  ctx.strokeRect(source.x, source.y, source.width, source.height)
  ctx.strokeRect(inset.x, inset.y, inset.width, inset.height)
  ctx.restore()
}

export function drawComposition(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  marks: Mark[],
  size: Point,
  opaque: boolean,
) {
  const original = { x: image.naturalWidth, y: image.naturalHeight }
  if (opaque) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size.x, size.y)
  }
  ctx.fillStyle = '#f4f2ed'
  ctx.fillRect(original.x, 0, size.x - original.x, size.y)
  ctx.fillRect(0, original.y, original.x, size.y - original.y)
  ctx.drawImage(image, 0, 0)

  const callouts = new Map(marks.flatMap(mark => {
    if (mark.type !== 'callout') return []
    const layout = layoutCallout(mark, original)
    return validCrop(layout.source) ? [[mark.id, { mark, ...layout }] as const] : []
  }))
  if ([...callouts.values()].some(({ mark }) => mark.callout.variant === 'spotlight')) {
    ctx.save()
    for (const { source } of callouts.values()) {
      ctx.beginPath()
      ctx.rect(0, 0, original.x, original.y)
      ctx.rect(source.x, source.y, source.width, source.height)
      ctx.clip('evenodd')
    }
    ctx.fillStyle = 'rgba(16, 19, 21, .48)'
    ctx.fillRect(0, 0, original.x, original.y)
    ctx.restore()
  }
  for (const mark of marks) {
    if (mark.type !== 'callout') drawMark(ctx, mark)
    else {
      const callout = callouts.get(mark.id)
      if (callout) drawCallout(ctx, image, callout)
    }
  }
}
