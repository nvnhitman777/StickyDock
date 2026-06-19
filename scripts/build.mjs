import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { execSync, spawn } from 'node:child_process'
import process from 'node:process'
import path from 'node:path'
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

function resolveSignTool() {
  const explicit = process.env.SIGN_TOOL_PATH
  if (explicit && existsSync(explicit)) {
    return explicit
  }

  const candidates = [
    path.join('C:', 'Program Files (x86)', 'Windows Kits', '10', 'bin'),
    path.join('C:', 'Program Files', 'Windows Kits', '10', 'bin')
  ]

  for (const binRoot of candidates) {
    if (!existsSync(binRoot)) {
      continue
    }

    try {
      const versions = readdirSync(binRoot)
        .filter((entry) => /^\d+\.\d+\.\d+\.\d+$/.test(entry))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))

      for (const version of versions) {
        const fullPath = path.join(binRoot, version, 'x64', 'signtool.exe')
        if (existsSync(fullPath)) {
          return fullPath
        }
      }
    } catch {
      // ignore unreadable directories
    }
  }

  return resolveBinary('signtool', [
    path.join('C:', 'Program Files (x86)', 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join('C:', 'Program Files (x86)', 'Windows Kits', '10', 'bin', 'x86', 'signtool.exe'),
    path.join('C:', 'Program Files', 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join('C:', 'Program Files', 'Windows Kits', '10', 'bin', 'x86', 'signtool.exe')
  ])
}

function resolveWixBinary(name) {
  const explicit = process.env.WIX_BIN_PATH
  if (explicit) {
    const candidate = path.isAbsolute(explicit) && path.basename(explicit).toLowerCase() === `${name}.exe`
      ? explicit
      : path.join(explicit, name)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const roots = [
    path.join('C:', 'Program Files (x86)'),
    path.join('C:', 'Program Files')
  ]

  for (const root of roots) {
    if (!existsSync(root)) {
      continue
    }

    try {
      const entries = readdirSync(root, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (/^WiX Toolset/i.test(entry.name) || /^WiX/i.test(entry.name)) {
          const candidate = path.join(root, entry.name, 'bin', name)
          if (existsSync(candidate)) {
            return candidate
          }
        }
      }
    } catch {
      // ignore unreadable directories
    }
  }

  return resolveBinary(name, [
    path.join('C:', 'Program Files (x86)', 'WiX Toolset v3.11', 'bin', `${name}.exe`),
    path.join('C:', 'Program Files', 'WiX Toolset v3.11', 'bin', `${name}.exe`)
  ])
}

function resolveWixExec() {
  const explicit = process.env.WIX_BIN_PATH
  if (explicit) {
    const candidate = path.isAbsolute(explicit) && path.basename(explicit).toLowerCase() === 'wix.exe'
      ? explicit
      : path.join(explicit, 'wix.exe')
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const userToolPath = path.join(process.env.USERPROFILE || '', '.dotnet', 'tools', 'wix.exe')
  if (existsSync(userToolPath)) {
    return userToolPath
  }

  return resolveBinary('wix', [
    path.join(process.env.USERPROFILE || '', '.dotnet', 'tools', 'wix.exe'),
    path.join('C:', 'Program Files (x86)', 'WiX Toolset v3.11', 'bin', 'wix.exe'),
    path.join('C:', 'Program Files', 'WiX Toolset v3.11', 'bin', 'wix.exe')
  ])
}

async function signFile(filePath) {
  const pfxPath = process.env.SIGN_PFX_PATH
  if (!pfxPath) {
    console.log('⏭️  Code signing skipped (SIGN_PFX_PATH not set).')
    return
  }

  if (!existsSync(pfxPath)) {
    throw new Error(`SIGN_PFX_PATH not found: ${pfxPath}`)
  }

  const signtool = resolveSignTool()
  if (!existsSync(signtool)) {
    throw new Error('signtool.exe not found; install Windows SDK or add signtool to PATH.')
  }

  console.log(`\n🪪 Using signtool at: ${signtool}`)
  const password = process.env.SIGN_PFX_PASSWORD || ''
  const timestampUrl = process.env.SIGN_TIMESTAMP_URL || 'http://timestamp.digicert.com'

  console.log(`\n🪪 Signing ${path.basename(filePath)}...`)

  await new Promise((resolve, reject) => {
    const args = [
      'sign',
      '/f',
      pfxPath,
      '/fd',
      'sha256',
      '/td',
      'sha256',
      '/tr',
      timestampUrl,
      '/v',
      filePath
    ]

    if (password) {
      args.splice(3, 0, '/p', password)
    }

    const child = spawn(signtool, args, {
      stdio: 'inherit',
      shell: false
    })

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`signtool failed with exit code ${code}`))
        return
      }
      resolve()
    })

    child.on('error', reject)
  })

  console.log(`✅ Signed ${path.basename(filePath)}`)
}

async function createInstaller(buildBinDir) {
  const nsisBinary = resolveBinary('makensis', [
    path.join('C:', 'Program Files (x86)', 'NSIS', 'makensis.exe'),
    path.join('C:', 'Program Files', 'NSIS', 'makensis.exe')
  ])

  if (!existsSync(nsisBinary)) {
    console.warn('⚠️ NSIS not found. Skipping installer creation.')
    console.warn('   Install NSIS and run `pnpm build:installer` again.')
    return
  }

  const installerDirectory = path.join(buildBinDir, 'installer')
  mkdirSync(installerDirectory, { recursive: true })

  const installerScriptPath = path.join(installerDirectory, 'StickyDockInstaller.nsi')
  const installerOutputPath = path.join(buildBinDir, 'StickyDock-Setup.exe')
  const exePath = path.join(buildBinDir, 'StickyDock.exe')

  const installerScript = `Name "StickyDock"
OutFile ${JSON.stringify(installerOutputPath)}
InstallDir \"$LOCALAPPDATA\\Programs\\StickyDock\"
SetShellVarContext current
!include \"MUI2.nsh\"
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE \"English\"

Section \"Install\"
  SetOutPath \"$INSTDIR\"
  File /oname=StickyDock.exe ${JSON.stringify(exePath)}
  CreateShortCut \"$DESKTOP\\StickyDock.lnk\" \"$INSTDIR\\StickyDock.exe\"
  CreateShortCut \"$SMPROGRAMS\\StickyDock\\StickyDock.lnk\" \"$INSTDIR\\StickyDock.exe\"
  WriteUninstaller \"$INSTDIR\\Uninstall.exe\"
SectionEnd

Section \"Uninstall\"
  Delete \"$INSTDIR\\StickyDock.exe\"
  Delete \"$DESKTOP\\StickyDock.lnk\"
  Delete \"$SMPROGRAMS\\StickyDock\\StickyDock.lnk\"
  Delete \"$INSTDIR\\Uninstall.exe\"
  RMDir \"$SMPROGRAMS\\StickyDock\"
  RMDir \"$INSTDIR\"
SectionEnd
`

  writeFileSync(installerScriptPath, installerScript, { encoding: 'utf8' })

  console.log('\n🛠️ Creating NSIS installer...')
  await new Promise((resolve, reject) => {
    const child = spawn(nsisBinary, [installerScriptPath], {
      stdio: 'inherit',
      shell: false
    })

    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`NSIS installer build failed with exit code ${code}`))
        return
      }
      resolve()
    })

    child.on('error', reject)
  })

  await signFile(installerOutputPath)
  console.log(`✅ Installer created: ${installerOutputPath}`)
}

function getWailsConfig() {
  try {
    const configPath = path.join(path.dirname(__dirname), 'wails.json')
    const file = readFileSync(configPath, 'utf8')
    return JSON.parse(file)
  } catch {
    return null
  }
}

async function createMsiInstaller(buildBinDir) {
  const candleBinary = resolveWixBinary('candle')
  const lightBinary = resolveWixBinary('light')
  const wixExec = resolveWixExec()
  const useClassicWix = existsSync(candleBinary) && existsSync(lightBinary)
  const useWixExec = !useClassicWix && existsSync(wixExec)

  if (!useClassicWix && !useWixExec) {
    console.warn('⚠️ WiX Toolset not found. Skipping MSI creation.')
    console.warn('   Install WiX or set WIX_BIN_PATH to a valid wix.exe, then run `pnpm build` again.')
    return
  }

  const info = getWailsConfig()
  const productVersion = info?.info?.productVersion || '1.0.0'
  const productName = info?.info?.productName || 'StickyDock'
  const companyName = info?.info?.companyName || 'StickyDock'

  const installerDirectory = path.join(buildBinDir, 'msi')
  mkdirSync(installerDirectory, { recursive: true })

  const wxsPath = path.join(installerDirectory, 'StickyDock.wxs')
  const wixobjPath = path.join(installerDirectory, 'StickyDock.wixobj')
  const msiPath = path.join(buildBinDir, 'StickyDock.msi')
  const exePath = path.join(buildBinDir, 'StickyDock.exe')

  const wxsNamespace = useWixExec ? 'http://wixtoolset.org/schemas/v4/wxs' : 'http://schemas.microsoft.com/wix/2006/wi'
  
  let installerScript
  if (useWixExec) {
    // WiX v4 (v7 CLI) structure
    installerScript = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="${wxsNamespace}">
  <Package
      Name="${productName}"
      Manufacturer="${companyName}"
      Language="1033"
      Version="${productVersion}"
      UpgradeCode="22F8BE77-14F2-4AD3-8A79-4677094E72C1"
      InstallerVersion="500"
      Compressed="yes"
      Scope="perUser">

    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />

    <MediaTemplate EmbedCab="yes" />

    <StandardDirectory Id="LocalAppDataFolder">
      <Directory Id="INSTALLFOLDER" Name="StickyDock">
        <Component Id="MainExecutable" Guid="*">
          <File Id="StickyDockExe" Source="${exePath}" KeyPath="yes" />
          <RegistryValue Root="HKCU" Key="Software\\${productName}" Name="installed" Type="integer" Value="1" KeyPath="no" />
        </Component>
      </Directory>
    </StandardDirectory>

    <StandardDirectory Id="DesktopFolder">
      <Component Id="DesktopShortcutComponent" Guid="A1B2C3D4-E5F6-4789-ABCD-EF1234567890">
        <Shortcut Id="DesktopShortcut" Name="StickyDock" Target="[INSTALLFOLDER]StickyDock.exe" WorkingDirectory="INSTALLFOLDER" />
      </Component>
    </StandardDirectory>

    <StandardDirectory Id="ProgramMenuFolder">
      <Directory Id="ApplicationProgramsFolder" Name="StickyDock">
        <Component Id="ProgramMenuComponent" Guid="B2C3D4E5-F6A7-4890-BCDE-F12345678901">
          <Shortcut Id="ProgramsShortcut" Name="StickyDock" Target="[INSTALLFOLDER]StickyDock.exe" WorkingDirectory="INSTALLFOLDER" />
          <RemoveFolder Id="ApplicationProgramsFolder" On="uninstall" />
        </Component>
      </Directory>
    </StandardDirectory>

    <Feature Id="MainFeature" Title="${productName}" Level="1">
      <ComponentRef Id="MainExecutable" />
      <ComponentRef Id="DesktopShortcutComponent" />
      <ComponentRef Id="ProgramMenuComponent" />
    </Feature>

  </Package>
</Wix>
`
  } else {
    // WiX v3 structure (candle/light)
    installerScript = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="${wxsNamespace}">
  <Product Id="*" Name="${productName}" Language="1033" Version="${productVersion}" Manufacturer="${companyName}" UpgradeCode="22F8BE77-14F2-4AD3-8A79-4677094E72C1">
    <Package InstallerVersion="500" Compressed="yes" InstallScope="perUser" InstallPrivileges="limited"/>
    <Media Id="1" Cabinet="product.cab" EmbedCab="yes"/>
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="INSTALLFOLDER" Name="StickyDock"/>
      </Directory>
      <Directory Id="DesktopFolder" Name="Desktop"/>
      <Directory Id="ProgramMenuFolder" Name="Programs">
        <Directory Id="ApplicationProgramsFolder" Name="StickyDock"/>
      </Directory>
    </Directory>

    <DirectoryRef Id="INSTALLFOLDER">
      <Component Id="MainExecutable" Guid="*">
        <File Id="StickyDockExe" Source="${exePath}" KeyPath="yes"/>
        <Shortcut Id="DesktopShortcut" Directory="DesktopFolder" Name="StickyDock" Target="[INSTALLFOLDER]StickyDock.exe" WorkingDirectory="INSTALLFOLDER"/>
        <Shortcut Id="ProgramsShortcut" Directory="ApplicationProgramsFolder" Name="StickyDock" Target="[INSTALLFOLDER]StickyDock.exe" WorkingDirectory="INSTALLFOLDER"/>
        <RemoveFolder Id="RemoveINSTALLFOLDER" Directory="INSTALLFOLDER" On="uninstall"/>
        <RegistryValue Root="HKCU" Key="Software\\${productName}" Name="installed" Type="integer" Value="1" KeyPath="no"/>
      </Component>
    </DirectoryRef>

    <DirectoryRef Id="ApplicationProgramsFolder">
      <Component Id="ProgramMenuFolder" Guid="*">
        <CreateFolder/>
      </Component>
    </DirectoryRef>

    <Feature Id="MainFeature" Title="${productName}" Level="1">
      <ComponentRef Id="MainExecutable"/>
      <ComponentRef Id="ProgramMenuFolder"/>
    </Feature>
  </Product>
</Wix>
`
  }

  writeFileSync(wxsPath, installerScript, { encoding: 'utf8' })

  if (useClassicWix) {
    console.log('\n🛠️ Compiling MSI installer with WiX v3 classic tools...')
    await new Promise((resolve, reject) => {
      const child = spawn(candleBinary, [wxsPath, '-out', wixobjPath], {
        stdio: 'inherit',
        shell: false
      })

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`WiX candle.exe failed with exit code ${code}`))
          return
        }
        resolve()
      })

      child.on('error', reject)
    })

    await new Promise((resolve, reject) => {
      const child = spawn(lightBinary, [wixobjPath, '-out', msiPath], {
        stdio: 'inherit',
        shell: false
      })

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`WiX light.exe failed with exit code ${code}`))
          return
        }
        resolve()
      })

      child.on('error', reject)
    })
  } else {
    console.log('\n🛠️ Compiling MSI installer with WiX v7 CLI...')
    console.log(`Using wix.exe at: ${wixExec}`)
    await new Promise((resolve, reject) => {
      const child = spawn(wixExec, ['--acceptEula', 'true', 'build', '-arch', 'x64', wxsPath, '-out', msiPath], {
        stdio: 'inherit',
        shell: false
      })

      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`WiX build failed with exit code ${code}`))
          return
        }
        resolve()
      })

      child.on('error', reject)
    })
  }

  await signFile(msiPath)
  const isSigned = process.env.SIGN_PFX_PATH ? 'signed' : 'unsigned'
  console.log(`\n✅ ${isSigned.charAt(0).toUpperCase() + isSigned.slice(1)} MSI created: ${msiPath}`)
  if (!process.env.SIGN_PFX_PATH) {
    console.log('   Code signing skipped. An unsigned MSI was created successfully.')
  }
}

const wailsExe = resolveBinary('wails', [
  path.join(process.env.GOBIN || '', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.GOPATH || '', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails'),
  path.join(process.env.HOME || process.env.USERPROFILE || '', 'go', 'bin', process.platform === 'win32' ? 'wails.exe' : 'wails')
])

const buildBinDir = path.join(path.dirname(__dirname), 'build', 'bin')
const exePath = path.join(buildBinDir, 'StickyDock.exe')

function finishBuild() {
  if (!existsSync(exePath)) {
    console.error('\n❌ Build failed: EXE not found at', exePath)
    process.exit(1)
  }
  console.log('\n✅ Build complete! The executable is available in build/bin.')
  process.exit(0)
}

const installerMode = process.argv.includes('--installer')
const msiMode = process.argv.includes('--msi')
const buildMode = msiMode ? 'msi' : installerMode ? 'installer' : 'exe'

function runWailsBuild() {
  return new Promise((resolve, reject) => {
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
        reject(new Error(`Wails build failed with exit code ${code ?? 1}`))
        return
      }
      resolve()
    })

    child.on('error', reject)

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
  })
}

async function runBuild() {
  await runWailsBuild()

  if (!existsSync(exePath)) {
    console.error('\n❌ Build failed: EXE not found at', exePath)
    process.exit(1)
  }

  await signFile(exePath)

  if (buildMode === 'msi') {
    await createMsiInstaller(buildBinDir)
    process.exit(0)
  }

  if (buildMode === 'installer') {
    await createInstaller(buildBinDir)
    process.exit(0)
  }

  finishBuild()
}

runBuild().catch((error) => {
  console.error('\n❌ Build failed:', error)
  process.exit(1)
})
