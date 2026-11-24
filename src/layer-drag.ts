type Drag = {
  row: HTMLElement
  grip: HTMLButtonElement
  id: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
}

export function installLayerDrag(list: HTMLUListElement, reorder: (id: string, index: number) => void) {
  const sidebar = list.closest<HTMLElement>('.sidebar')!
  let drag: Drag | undefined
  let indicator: HTMLElement | undefined
  let frame = 0

  function destination(current: Drag) {
    const bounds = list.getBoundingClientRect()
    const panel = sidebar.getBoundingClientRect()
    if (current.x < bounds.left - 8 || current.x > bounds.right + 8
      || current.y < Math.max(bounds.top - 12, panel.top, 0)
      || current.y > Math.min(bounds.bottom + 12, panel.bottom, window.innerHeight)) return

    const rows = [...list.children] as HTMLElement[]
    const from = rows.indexOf(current.row)
    if (from < 0) return
    const others = rows.filter(row => row !== current.row)
    const before = others.findIndex(row => {
      const rect = row.getBoundingClientRect()
      return current.y < rect.top + rect.height / 2
    })
    const index = before === -1 ? others.length : before
    if (index === from) return
    const target = others[index] ?? others.at(-1)
    if (target) return { index, target, edge: before === -1 ? 'after' : 'before' }
  }

  function showDestination(current: Drag) {
    if (indicator) delete indicator.dataset.dropEdge
    const drop = destination(current)
    indicator = drop?.target
    if (indicator && drop) indicator.dataset.dropEdge = drop.edge
  }

  function autoScroll() {
    frame = 0
    if (!drag?.active) return
    const scroller = sidebar.scrollHeight > sidebar.clientHeight ? sidebar : document.scrollingElement
    if (!scroller) return
    const listBounds = list.getBoundingClientRect()
    if (drag.x < listBounds.left - 8 || drag.x > listBounds.right + 8) return
    const viewport = scroller === sidebar ? sidebar.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
    if (drag.y < viewport.top || drag.y > viewport.bottom) return

    const margin = 32
    const distance = drag.y < viewport.top + margin ? drag.y - viewport.top - margin
      : drag.y > viewport.bottom - margin ? drag.y - viewport.bottom + margin : 0
    if (!distance) return
    const previous = scroller.scrollTop
    scroller.scrollTop += Math.sign(distance) * Math.ceil(Math.abs(distance) / 3)
    if (scroller.scrollTop === previous) return
    showDestination(drag)
    frame = window.requestAnimationFrame(autoScroll)
  }

  function cancel() {
    if (!drag) return
    const { row, grip, pointerId } = drag
    drag = undefined
    row.classList.remove('is-dragging')
    if (indicator) delete indicator.dataset.dropEdge
    indicator = undefined
    window.cancelAnimationFrame(frame)
    frame = 0
    if (grip.hasPointerCapture(pointerId)) grip.releasePointerCapture(pointerId)
  }

  list.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return
    const grip = event.target.closest<HTMLButtonElement>('.layer-grip')
    const row = grip?.closest<HTMLElement>('[data-layer-id]')
    const id = row?.dataset.layerId
    if (!grip || grip.disabled || !row || !id) return
    event.preventDefault()
    grip.focus({ preventScroll: true })
    drag = {
      row, grip, id, pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false,
    }
    grip.setPointerCapture(event.pointerId)
  })

  list.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    drag.active = true
    drag.row.classList.add('is-dragging')
    drag.x = event.clientX
    drag.y = event.clientY
    showDestination(drag)
    if (!frame) frame = window.requestAnimationFrame(autoScroll)
  })

  list.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const { id, active } = drag
    const drop = active ? destination({ ...drag, x: event.clientX, y: event.clientY }) : undefined
    cancel()
    if (drop) reorder(id, drop.index)
  })

  const release = (event: PointerEvent) => { if (event.pointerId === drag?.pointerId) cancel() }
  list.addEventListener('pointercancel', release)
  list.addEventListener('lostpointercapture', release)
  list.addEventListener('keydown', event => {
    if (!drag || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    cancel()
  })
  window.addEventListener('blur', cancel)
  return cancel
}
