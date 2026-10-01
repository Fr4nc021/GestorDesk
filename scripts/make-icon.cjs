const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const src = process.argv[2]
const outIco = process.argv[3]
if (!src || !outIco) {
  console.error('Uso: node scripts/make-icon.cjs <png> <ico>')
  process.exit(1)
}

fs.mkdirSync(path.dirname(outIco), { recursive: true })
const sourcePng = path.join(path.dirname(outIco), 'icon.png')
if (path.resolve(src) !== path.resolve(sourcePng)) {
  fs.copyFileSync(src, sourcePng)
}

const tmp = path.join(path.dirname(outIco), '.icon-sizes')
fs.mkdirSync(tmp, { recursive: true })
const sizes = [16, 24, 32, 48, 64, 128, 256]
const psPath = path.join(tmp, 'resize.ps1')
const srcPs = src.replace(/'/g, "''")
const tmpPs = tmp.replace(/'/g, "''")

fs.writeFileSync(
  psPath,
  `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${srcPs}')
try {
  foreach ($s in @(${sizes.join(',')})) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))
    $g.DrawImage($src, 0, 0, $s, $s)
    $g.Dispose()
    $dest = Join-Path '${tmpPs}' ("icon-$s.bmp")
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $bmp.Dispose()
  }
} finally {
  $src.Dispose()
}
`,
  'utf8'
)

execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath], {
  stdio: 'inherit',
})

function imagemIcoBmp(file, size) {
  const buf = fs.readFileSync(file)
  const pixelOffset = buf.readUInt32LE(10)
  const width = buf.readInt32LE(18)
  const heightRaw = buf.readInt32LE(22)
  const height = Math.abs(heightRaw)
  const bitCount = buf.readUInt16LE(28)
  if (width !== size || height !== size || bitCount !== 32) {
    throw new Error(`BMP ${file} inesperado: ${width}x${height} ${bitCount}bpp`)
  }
  const rowSize = width * 4
  const xor = Buffer.alloc(rowSize * height)
  if (heightRaw > 0) {
    buf.copy(xor, 0, pixelOffset, pixelOffset + xor.length)
  } else {
    for (let row = 0; row < height; row += 1) {
      buf.copy(xor, (height - 1 - row) * rowSize, pixelOffset + row * rowSize, pixelOffset + (row + 1) * rowSize)
    }
  }
  const maskStride = Math.ceil(width / 32) * 4
  const mask = Buffer.alloc(maskStride * height, 0)
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)
  header.writeUInt32LE(0, 16)
  header.writeUInt32LE(xor.length, 20)
  return Buffer.concat([header, xor, mask])
}

const images = sizes.map((size) => ({
  size,
  buf: imagemIcoBmp(path.join(tmp, `icon-${size}.bmp`), size),
}))

const count = images.length
const headerSize = 6 + 16 * count
let offset = headerSize
const entries = images.map((item) => {
  const entry = {
    w: item.size >= 256 ? 0 : item.size,
    h: item.size >= 256 ? 0 : item.size,
    len: item.buf.length,
    offset,
  }
  offset += item.buf.length
  return entry
})

const out = Buffer.alloc(offset)
out.writeUInt16LE(0, 0)
out.writeUInt16LE(1, 2)
out.writeUInt16LE(count, 4)
entries.forEach((entry, index) => {
  const p = 6 + index * 16
  out.writeUInt8(entry.w, p)
  out.writeUInt8(entry.h, p + 1)
  out.writeUInt8(0, p + 2)
  out.writeUInt8(0, p + 3)
  out.writeUInt16LE(1, p + 4)
  out.writeUInt16LE(32, p + 6)
  out.writeUInt32LE(entry.len, p + 8)
  out.writeUInt32LE(entry.offset, p + 12)
})
images.forEach((item, index) => {
  item.buf.copy(out, entries[index].offset)
})

fs.mkdirSync(path.dirname(outIco), { recursive: true })
fs.writeFileSync(outIco, out)
fs.rmSync(tmp, { recursive: true, force: true })
console.log(`ICO gerado: ${outIco} (${out.length} bytes)`)
