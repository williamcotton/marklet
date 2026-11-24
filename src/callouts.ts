import { drawMark, type CalloutMark, type Mark, type Point, type Rectangle } from './annotations'

export const calloutVariants = {
  connected: 'Connected',
  spotlight: 'Spotlight',
  shaded: 'Shaded',
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

function drawCallout(ctx: CanvasRenderingContext2D, image: HTMLImageElement, { mark, source, inset }: CalloutDrawing) {
  const { variant } = mark.callout
  const { color, weight } = mark.style
  const [a, b, c, d] = facingEdges(source, inset)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = weight
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (variant === 'shaded') {
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
    if (variant === 'spotlight') ctx.setLineDash([weight * 3, weight * 2])
    ctx.beginPath()
    ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
    ctx.lineTo((c.x + d.x) / 2, (c.y + d.y) / 2)
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
