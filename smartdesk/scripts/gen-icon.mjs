// 生成托盘图标 resources/icons/tray.png（32x32，主题青绿色圆角方块）
// 用法：node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 32

// CRC32（PNG chunk 校验）
const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// 主题色：#2f8a80 青绿，中心 #3fae79 高亮，暗底 #172327
function pixel(x, y) {
  const cx = x - SIZE / 2 + 0.5
  const cy = y - SIZE / 2 + 0.5
  const r = Math.max(Math.abs(cx), Math.abs(cy))
  const corner = Math.hypot(cx - Math.sign(cx) * 11, cy - Math.sign(cy) * 11)
  const inSquare = r <= 13 && (r <= 9 || corner <= 11)
  if (!inSquare) return [0, 0, 0, 0]

  // 中心画一个“策”字意象的亮点：上圆点 + 下竖线
  const inDot = Math.hypot(cx, cy + 6) <= 3.2
  const inLine = Math.abs(cx) <= 1.8 && cy >= -4 && cy <= 6
  if (inDot || inLine) return [0x3f, 0xae, 0x79, 255]
  return [0x2f, 0x8a, 0x80, 255]
}

const rows = []
for (let y = 0; y < SIZE; y++) {
  const row = Buffer.alloc(1 + SIZE * 4)
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y)
    row.writeUInt8(r, 1 + x * 4)
    row.writeUInt8(g, 2 + x * 4)
    row.writeUInt8(b, 3 + x * 4)
    row.writeUInt8(a, 4 + x * 4)
  }
  rows.push(row)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.concat(rows))),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(root, 'resources', 'icons', 'tray.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log('written', out, png.length, 'bytes')
