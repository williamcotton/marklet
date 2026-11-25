import type { CalloutMark } from './annotations'
import { imageProject, toImageBlob, type Project } from './project'

const program = [
  "import { round } from './math'",
  '',
  'type Reading = {',
  '  timestamp: number',
  '  value: number',
  '  unit?: string',
  '}',
  '',
  'export function normalize(readings: Reading[]) {',
  '  return readings',
  '    .map(({ value, unit }) => ({',
  '      value: round(value, 2),',
  "      unit: unit ?? '°C',",
  '    }))',
  '    .filter(({ value }) => value > 0)',
  '}',
  '',
  'export function latest(readings: Reading[]) {',
  '  return normalize(readings).at(-1)',
  '}',
]

function tokenColor(token: string) {
  if (token.startsWith("'")) return '#b5d896'
  if (/^-?\d/.test(token)) return '#e5ad81'
  if (/^(import|from|type|export|function|return)$/.test(token)) return '#d4acf6'
  if (/^(Reading|number|string)$/.test(token)) return '#a3d9e7'
  if (/^(normalize|latest|round|map|filter|at)$/.test(token)) return '#f4d2a0'
  if (/^[{}()[\].,:?=>]/.test(token)) return '#b1bac0'
  return '#e4e9eb'
}

export async function createDemo(): Promise<Project> {
  await document.fonts.load('600 20px "DM Sans Variable"')
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 900
  const ctx = canvas.getContext('2d')!
  const headingFont = '600 20px "DM Sans Variable", sans-serif'
  const mono = '20px "SFMono-Regular", Menlo, Consolas, monospace'

  ctx.fillStyle = '#202729'
  ctx.fillRect(0, 0, 1440, 900)
  ctx.fillStyle = '#2b3436'
  ctx.fillRect(0, 0, 1440, 72)
  ctx.fillStyle = '#252e30'
  ctx.fillRect(0, 73, 1440, 58)
  ctx.fillRect(0, 848, 1440, 52)
  ctx.fillStyle = '#3c484b'
  for (const y of [72, 130, 847]) ctx.fillRect(0, y, 1440, 1)
  ctx.fillRect(82, 131, 1, 715)

  ctx.fillStyle = '#8bc5d0'
  ctx.beginPath()
  ctx.roundRect(40, 22, 28, 28, 5)
  ctx.fill()
  ctx.fillStyle = '#243237'
  ctx.font = '750 14px "DM Sans Variable", sans-serif'
  ctx.fillText('TS', 46, 41)
  ctx.font = headingFont
  ctx.fillStyle = '#edf1f0'
  ctx.fillText('readings.ts', 82, 43)
  ctx.font = '500 16px "DM Sans Variable", sans-serif'
  ctx.fillStyle = '#a0b0b3'
  ctx.fillText('src  /  sensors  /  readings.ts', 42, 108)

  ctx.font = mono
  program.forEach((line, index) => {
    const y = 173 + 32 * index
    ctx.textAlign = 'right'
    ctx.fillStyle = '#819296'
    ctx.fillText(String(index + 1), 66, y)
    ctx.textAlign = 'left'
    let x = 105
    for (const token of line.match(/'[^']*'|-?\d+|[a-zA-Z]+|[^a-zA-Z\d']/g) ?? []) {
      ctx.fillStyle = tokenColor(token)
      ctx.fillText(token, x, y)
      x += ctx.measureText(token).width
    }
  })
  ctx.font = '500 16px "DM Sans Variable", sans-serif'
  ctx.fillStyle = '#a0b0b3'
  ctx.fillText('TypeScript', 42, 880)
  ctx.textAlign = 'right'
  ctx.fillText('UTF-8', 1397, 880)

  const sample: CalloutMark = {
    id: 'sample-callout',
    type: 'callout',
    label: 'Normalization step',
    from: { x: 95, y: 476 },
    to: { x: 520, y: 599 },
    style: { color: '#f5ca48', weight: 3, opacity: 100 },
    callout: { variant: 'shaded', magnification: 1.5, position: { x: 694, y: 443 } },
    text: '',
  }
  const project = await imageProject(await toImageBlob(canvas, 'image/png'), 'Sensor readings', 'readings.ts.png')
  return { ...project, marks: [sample] }
}
