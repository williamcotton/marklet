import type { Mark } from './annotations'
import { asDataUrl, loadImage, toImageBlob, type Project } from './project'
import photograph from './dolomites.webp?url'

function letterspaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  for (const letter of text) {
    ctx.fillText(letter, x, y)
    x += ctx.measureText(letter).width + spacing
  }
}

const marks: Mark[] = [
  { id: 'sample-highlight', type: 'highlight', from: { x: 72, y: 228 }, to: { x: 305, y: 257 }, text: '', label: 'Location highlight', style: { color: '#f5ca48', weight: 4, opacity: 52 } },
  { id: 'sample-outline', type: 'box', from: { x: 64, y: 281 }, to: { x: 648, y: 537 }, text: '', label: 'Headline outline', style: { color: '#db5038', weight: 4, opacity: 100 } },
  { id: 'sample-arrow', type: 'arrow', from: { x: 1161, y: 441 }, to: { x: 1287, y: 470 }, text: '', label: 'Boathouse arrow', style: { color: '#db5038', weight: 6, opacity: 100 } },
  { id: 'sample-note', type: 'text', from: { x: 770, y: 598 }, to: { x: 770, y: 598 }, text: 'Keep this crop', label: 'Crop note', style: { color: '#ffffff', weight: 32, opacity: 100 } },
]

export async function createDemo(): Promise<Project> {
  const [photo] = await Promise.all([
    loadImage(photograph),
    document.fonts.load('400 110px "Instrument Serif"'),
    document.fonts.load('500 24px "DM Sans Variable"'),
    document.fonts.load('700 20px "DM Sans Variable"'),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = 1440
  canvas.height = 900
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f7f6ef'
  ctx.fillRect(0, 0, 1440, 900)
  ctx.fillStyle = '#e0e0d4'
  ctx.fillRect(0, 99, 1440, 2)
  ctx.fillRect(74, 797, 1292, 2)

  ctx.fillStyle = '#3d5345'
  ctx.beginPath()
  ctx.roundRect(74, 36, 32, 32, 7)
  ctx.fill()
  ctx.fillStyle = '#f7f6ef'
  ctx.beginPath()
  ctx.moveTo(80, 59)
  ctx.lineTo(89, 45)
  ctx.lineTo(98, 59)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#292f27'
  ctx.font = '400 45px "Instrument Serif", Georgia, serif'
  ctx.fillText('fieldwork.', 117, 67)

  ctx.font = '500 19px "DM Sans Variable", sans-serif'
  ctx.fillText('Journal', 1072, 59)
  ctx.fillText('About', 1164, 59)
  ctx.strokeStyle = '#c7ccbf'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(1256, 31, 112, 43, 21.5)
  ctx.stroke()
  ctx.fillText('Explore', 1279, 59)

  ctx.fillStyle = '#4b5b49'
  ctx.font = '700 19px "DM Sans Variable", sans-serif'
  letterspaced(ctx, 'THE DOLOMITES', 82, 251, 2.6)

  ctx.fillStyle = '#263128'
  ctx.font = '400 99px "Instrument Serif", Georgia, serif'
  ctx.fillText('Where the', 80, 388)
  ctx.fillText('mountains meet.', 80, 495, 546)

  ctx.fillStyle = '#556056'
  ctx.font = '500 24px "DM Sans Variable", sans-serif'
  ctx.fillText('A slow morning at Lago di Braies.', 80, 611)

  ctx.fillStyle = '#3d5345'
  ctx.beginPath()
  ctx.roundRect(78, 656, 240, 59, 29.5)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 20px "DM Sans Variable", sans-serif'
  ctx.fillText('Read the field note', 111, 693)

  const photoWidth = 673
  const photoHeight = 596
  const cropWidth = photo.naturalHeight * (photoWidth / photoHeight)
  ctx.drawImage(photo, (photo.naturalWidth - cropWidth) * .86, 0, cropWidth, photo.naturalHeight, 693, 150, photoWidth, photoHeight)

  ctx.fillStyle = '#667265'
  ctx.font = '700 16px "DM Sans Variable", sans-serif'
  letterspaced(ctx, 'FIELD NOTES NO. 01', 76, 856, 2.2)
  letterspaced(ctx, 'SOUTH TYROL, ITALY', 1151, 856, 2.2)

  const imageSrc = await asDataUrl(await toImageBlob(canvas, 'image/png'))
  return { name: 'Alpine field notes', imageName: 'fieldwork-homepage.png', imageSrc, marks }
}
