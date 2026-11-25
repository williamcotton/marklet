import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'electron'

export function developmentElectron() {
  if (process.platform !== 'darwin' || process.env.ELECTRON_EXEC_PATH) return electron
  const stock = dirname(dirname(dirname(electron)))
  const icon = fileURLToPath(new URL('../electron/resources/icon.icns', import.meta.url))
  const key = createHash('sha256')
    .update(readFileSync(join(stock, 'Contents', 'Info.plist')))
    .update(readFileSync(icon)).digest('hex').slice(0, 16)
  const cache = fileURLToPath(new URL('../node_modules/.cache/marklet', import.meta.url))
  const directory = join(cache, key)
  const program = join(directory, 'Marklet.app', 'Contents', 'MacOS', 'Electron')
  if (existsSync(program)) return program

  mkdirSync(cache, { recursive: true })
  const staging = mkdtempSync(join(cache, '.bundle-'))
  try {
    const bundle = join(staging, 'Marklet.app')
    cpSync(stock, bundle, { recursive: true, verbatimSymlinks: true, mode: constants.COPYFILE_FICLONE })
    const contents = join(bundle, 'Contents')
    for (const [key, value] of Object.entries({
      CFBundleName: 'Marklet', CFBundleDisplayName: 'Marklet',
      CFBundleIdentifier: 'com.williamcotton.marklet.dev', CFBundleIconFile: 'marklet.icns',
    })) execFileSync('plutil', ['-replace', key, '-string', value, join(contents, 'Info.plist')])
    copyFileSync(icon, join(contents, 'Resources', 'marklet.icns'))
    execFileSync('codesign', ['--force', '--sign', '-', '--preserve-metadata=entitlements,flags', bundle])
    try { renameSync(staging, directory) }
    catch (failure) { if (!existsSync(program)) throw failure }
  } finally { rmSync(staging, { recursive: true, force: true }) }
  return program
}
