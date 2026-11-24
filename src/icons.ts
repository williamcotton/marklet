import arrow from 'lucide-static/icons/arrow-up-right.svg?raw'
import check from 'lucide-static/icons/check.svg?raw'
import chevron from 'lucide-static/icons/chevron-down.svg?raw'
import circleHelp from 'lucide-static/icons/circle-help.svg?raw'
import download from 'lucide-static/icons/download.svg?raw'
import fileImage from 'lucide-static/icons/image.svg?raw'
import folder from 'lucide-static/icons/folder-open.svg?raw'
import highlighter from 'lucide-static/icons/highlighter.svg?raw'
import layers from 'lucide-static/icons/layers.svg?raw'
import mouse from 'lucide-static/icons/mouse-pointer-2.svg?raw'
import minus from 'lucide-static/icons/minus.svg?raw'
import pen from 'lucide-static/icons/pen-line.svg?raw'
import plus from 'lucide-static/icons/plus.svg?raw'
import redo from 'lucide-static/icons/redo-2.svg?raw'
import save from 'lucide-static/icons/save.svg?raw'
import scan from 'lucide-static/icons/scan.svg?raw'
import sliders from 'lucide-static/icons/sliders-horizontal.svg?raw'
import square from 'lucide-static/icons/square.svg?raw'
import trash from 'lucide-static/icons/trash-2.svg?raw'
import type from 'lucide-static/icons/type.svg?raw'
import undo from 'lucide-static/icons/undo-2.svg?raw'
import upload from 'lucide-static/icons/upload.svg?raw'
import x from 'lucide-static/icons/x.svg?raw'
import zoom from 'lucide-static/icons/zoom-in.svg?raw'

const icons = { arrow, check, chevron, circleHelp, download, fileImage, folder, highlighter, layers, mouse, minus, pen, plus, redo, save, scan, sliders, square, trash, type, undo, upload, x, zoom }

export function icon(name: keyof typeof icons) {
  return icons[name].replace('<svg', '<svg aria-hidden="true" focusable="false"')
}

export const toolIcons = {
  select: 'mouse', box: 'square', highlight: 'highlighter', arrow: 'arrow', text: 'type', callout: 'zoom',
} as const
