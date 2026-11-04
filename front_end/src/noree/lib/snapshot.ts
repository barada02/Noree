import type { AiObject, Stroke } from '../../shared/protocol.js'
import type { PageItem } from '../../shared/schema.js'
import { arrowGeometry, ellipsePath, strokePath } from './path'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function asDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read a pasted image.'))
    reader.readAsDataURL(blob)
  })
}

/** An SVG drawn as an image can't load other files, so pasted images are embedded. */
async function pasteSvg(item: PageItem): Promise<string> {
  if (item.kind === 'image') {
    if (!item.url.startsWith('/api/assets/')) return ''
    return `<image x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" href="${await asDataUrl(item.url)}"/>`
  }
  const lines: string[] = []
  for (const line of item.text.split('\n')) {
    for (let i = 0; i < Math.max(1, line.length); i += 42) lines.push(line.slice(i, i + 42))
  }
  const text = lines
    .slice(0, Math.floor((item.h - 24) / 28))
    .map((line, i) => `<text x="${item.x + 12}" y="${item.y + 34 + i * 28}" font-family="sans-serif" font-size="22" fill="#000">${esc(line)}</text>`)
    .join('')
  return `<rect x="${item.x}" y="${item.y}" width="${item.w}" height="${item.h}" rx="8" fill="#fffbeb" stroke="#999"/>${text}`
}

/**
 * Rasterise the canvas to a PNG data URL for the vision model: black ink on white (best
 * contrast for handwriting), plus simple versions of earlier AI objects. Theme independent.
 */
export async function makeSnapshot(
  world: { width: number; height: number },
  strokes: Stroke[],
  objects: AiObject[],
  pastes: PageItem[] = [],
  scale = 0.75,
): Promise<string> {
  const parts: string[] = [`<rect width="${world.width}" height="${world.height}" fill="#fff"/>`]
  for (const item of pastes) parts.push(await pasteSvg(item))
  for (const s of strokes) {
    parts.push(`<path d="${strokePath(s.points)}" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`)
  }
  for (const o of objects) {
    if (o.kind === 'ellipse') {
      parts.push(`<path d="${ellipsePath(o.cx, o.cy, o.rx, o.ry)}" fill="none" stroke="#e85d26" stroke-width="3"/>`)
    } else if (o.kind === 'arrow') {
      const g = arrowGeometry(o.from, o.to, o.bend)
      parts.push(`<path d="${g.d}" fill="none" stroke="#e85d26" stroke-width="3"/><path d="${g.head}" fill="none" stroke="#e85d26" stroke-width="3"/>`)
    } else if (o.kind === 'livelabel') {
      continue // derived from a widget; nothing the model needs to see
    } else if (o.kind === 'widget') {
      parts.push(
        `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="8" fill="#fff4ee" stroke="#e85d26" stroke-width="2"/>` +
          `<text x="${o.x + 14}" y="${o.y + 28}" font-family="sans-serif" font-size="18" font-weight="700" fill="#e85d26">${esc(o.title)} (${o.widget.type} widget)</text>`,
      )
    } else {
      parts.push(
        `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="8" fill="#fff4ee" stroke="#e85d26" stroke-width="2"/>` +
          `<text x="${o.x + 14}" y="${o.y + 28}" font-family="sans-serif" font-size="18" font-weight="700" fill="#e85d26">${esc(o.title)}</text>`,
      )
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${world.width * scale}" height="${world.height * scale}" viewBox="0 0 ${world.width} ${world.height}">${parts.join('')}</svg>`
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = world.width * scale
  canvas.height = world.height * scale
  canvas.getContext('2d')!.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}
