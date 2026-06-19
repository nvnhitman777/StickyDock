import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import process from 'node:process'
import path from 'node:path'
import archiver from 'archiver'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const workspaceRoot = process.cwd()
const cacheRoot = path.join(workspaceRoot, '.cache')
const appDataRoot = path.join(cacheRoot, 'appdata')
const goCacheRoot = path.join(cacheRoot, 'gocache')
const goModCacheRoot = path.join(cacheRoot, 'gomodcache')

mkdirSync(appDataRoot, { recursive: true })
mkdirSync(goCacheRoot, { recursive: true })
mkdirSync(goModCacheRoot, { recursive: true })

function resolveBinary(name, fallbackPaths = []) {
  try {
    const lookup = process.platform === 'win32' ? 'where' : 'command -v'
    const resolved = execSync(`${lookup} ${name}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .split(/\r?\n/)[0]
      .trim()

    if (resolved) {
      return resolved
    }
  } catch {
    // Ignore resolution failures and use fallback paths.
  }

  for (const candidate of fallbackPaths) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return name
}

const wailsExe = resolveBinary('wails', [
  path.join(process.env.GOBIN || '', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.GOPATH || '', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.HOME || process.env.USERPROFILE || '', 'go', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails')
])

const child = spawn(wailsExe, ['build', '-skipbindings', '-nosyncgomod'], {
  env: {
    ...process.env,
    APPDATA: appDataRoot,
    LOCALAPPDATA: appDataRoot,
    GOCACHE: goCacheRoot,
    GOMODCACHE: goModCacheRoot,
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    NO_PROXY: ''
  },
  stdio: 'inherit',
  shell: false
})

child.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1)
    return
  }

  // Create ZIP bundle after successful build
  const buildBinDir = path.join(path.dirname(__dirname), 'build', 'bin')
  const exePath = path.join(buildBinDir, 'StickyDock.exe')
  const zipPath = path.join(buildBinDir, 'StickyDock.zip')

  if (!existsSync(exePath)) {
    console.error('\n❌ Build failed: EXE not found at', exePath)
    process.exit(1)
  }

  console.log('\n📦 Creating ZIP bundle...')

  const output = createWriteStream(zipPath)
  const archive = archiver('zip', { zlib: { level: 6 } })

  output.on('close', () => {
    console.log(`✅ ZIP created successfully: ${path.basename(zipPath)} (${Math.round(archive.pointer() / 1024)} KB)`)
    console.log(`📂 Location: ${zipPath}`)
    console.log('\n✨ Build complete! Share this ZIP file instead of the EXE.')
    process.exit(0)
  })

  archive.on('error', (err) => {
    console.error('\n❌ ZIP creation failed:', err)
    process.exit(1)
  })

  archive.pipe(output)
  archive.file(exePath, { name: 'StickyDock.exe' })
  archive.finalize()
})

process.on('SIGINT', () => {
  console.log('\n⚠️ Build interrupted')
  child.kill()
  process.exit(130)
})
process.on('SIGTERM', () => {
  console.log('\n⚠️ Build terminated')
  child.kill()
  process.exit(143)
})
