import net from 'node:net'
import { execSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import process from 'node:process'
import path from 'node:path'

const host = '127.0.0.1'

function resolveBinary(name, fallbackPaths = []) {
  try {
    const lookup = process.platform === 'win32' ? 'where' : 'command -v'
    const output = execSync(`${lookup} ${name}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (output.length) {
      if (process.platform === 'win32') {
        const wrapper = output.find((file) => /\.(cmd|bat|ps1)$/i.test(file))
        if (wrapper) {
          return wrapper
        }
      }
      return output[0]
    }
  } catch {
    // Ignore resolution failures and try fallback paths.
  }

  for (const candidate of fallbackPaths) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return name
}

function resolveNpmCli() {
  const npmPath = resolveBinary('npm')
  const npmDir = path.dirname(npmPath)
  const candidates = [
    path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeRoot, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(npmDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(npmDir, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return npmPath
}

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
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
    shell: false,
    ...options
  })
}

const nodeExe = process.execPath
const nodeRoot = path.dirname(nodeExe)
const npmCli = resolveNpmCli()
const wailsExe = resolveBinary('wails', [
  path.join(process.env.GOBIN || '', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.GOPATH || '', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.HOME || process.env.USERPROFILE || '', 'go', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails')
])
const workspaceRoot = process.cwd()
const cacheRoot = path.join(workspaceRoot, '.cache')
const appDataRoot = path.join(cacheRoot, 'appdata')
const goCacheRoot = path.join(cacheRoot, 'gocache')
const goModCacheRoot = path.join(cacheRoot, 'gomodcache')

mkdirSync(appDataRoot, { recursive: true })
mkdirSync(goCacheRoot, { recursive: true })
mkdirSync(goModCacheRoot, { recursive: true })

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(false))
    server.listen({ host, port }, () => {
      server.close(() => resolve(true))
    })
  })
}

async function findPort(startPort) {
  for (let port = startPort; port < startPort + 25; port += 1) {
    if (await isPortFree(port)) {
      return port
    }
  }

  throw new Error('No free frontend port found.')
}

function waitForHttp(port, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()

    const tick = () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 1000)

      fetch(`http://${host}:${port}/`, {
        signal: controller.signal,
        cache: 'no-store'
      })
        .then((response) => {
          clearTimeout(timeout)
          if (!response.ok && response.status !== 404) {
            throw new Error(`Unexpected status ${response.status}`)
          }
          resolve()
        })
        .catch(() => {
          clearTimeout(timeout)
          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(`Timed out waiting for http://${host}:${port}`))
            return
          }

          setTimeout(tick, 250)
        })
    }

    tick()
  })
}

const port = await findPort(4173)
const frontendUrl = `http://${host}:${port}`

const vite = process.platform === 'win32' && npmCli.toLowerCase().endsWith('.cmd')
  ? spawnProcess(npmCli, [
      'run',
      'dev:ui',
      '--',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort'
    ])
  : spawnProcess(nodeExe, [
      npmCli,
      'run',
      'dev:ui',
      '--',
      '--host',
      host,
      '--port',
      String(port),
      '--strictPort'
    ])

vite.on('exit', (code) => {
  if (code && code !== 0) {
    process.exit(code)
  }
})

await waitForHttp(port)

const wails = spawnProcess(wailsExe, [
  'dev',
  '-m',
  '-nosyncgomod',
  '-skipbindings',
  '-s',
  '-frontenddevserverurl',
  frontendUrl
])

const children = [vite, wails]

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
  process.exit(code)
}

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown(code)
      return
    }

    if (children.every((proc) => proc.exitCode !== null)) {
      shutdown(0)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
