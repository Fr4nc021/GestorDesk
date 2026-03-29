const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

const MAX_ATTEMPTS = 3
const BASE_RELEASE_DIR = path.join(process.cwd(), 'release')

function timestamp() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

function runBuilder(outputDir) {
  return new Promise((resolve) => {
    const builderBin = path.join(process.cwd(), 'node_modules', '.bin', 'electron-builder.cmd')
    const args = [`--config.directories.output=${outputDir}`]
    const child = spawn(builderBin, args, {
      shell: true,
      stdio: 'inherit',
    })

    child.on('error', () => undefined)

    child.on('exit', (code) => {
      resolve({ code: code ?? 1 })
    })
  })
}

async function main() {
  fs.mkdirSync(BASE_RELEASE_DIR, { recursive: true })

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const outputDir = path.join(BASE_RELEASE_DIR, `build-${timestamp()}-${attempt}`)
    console.log(`[dist] Tentativa ${attempt}/${MAX_ATTEMPTS} -> ${outputDir}`)

    const result = await runBuilder(outputDir)
    if (result.code === 0) {
      console.log(`[dist] Instalador gerado com sucesso em: ${outputDir}`)
      process.exit(0)
    }

    if (attempt < MAX_ATTEMPTS) {
      console.warn('[dist] Falha de empacotamento. Tentando novamente com outra pasta de saida...')
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }

    console.error('[dist] Nao foi possivel gerar o instalador.')
    process.exit(result.code)
  }
}

main()
  .then(() => undefined)
  .catch((err) => {
    console.error('[dist] Erro inesperado:', err?.message || err)
    process.exit(1)
  })
