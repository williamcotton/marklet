import { app, BrowserWindow, net, protocol } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const origin = 'marklet://app'
const contentSecurityPolicy = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
].join('; ')

protocol.registerSchemesAsPrivileged([{
  scheme: 'marklet',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}])

async function serveEditor(request: Request) {
  const url = new URL(request.url)
  if (url.protocol !== 'marklet:' || url.host !== 'app') return new Response(null, { status: 404 })
  if (request.method !== 'GET') return new Response(null, { status: 405 })

  const root = join(app.getAppPath(), 'dist')
  try {
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
    const filename = resolve(root, `.${pathname}`)
    const asset = relative(root, filename)
    if (!asset || asset === '..' || asset.startsWith(`..${sep}`) || isAbsolute(asset)) {
      return new Response(null, { status: 404 })
    }

    const response = await net.fetch(pathToFileURL(filename).href)
    if (asset !== 'index.html') return response

    const headers = new Headers(response.headers)
    headers.set('Content-Security-Policy', contentSecurityPolicy)
    return new Response(response.body, { status: response.status, headers })
  } catch {
    return new Response(null, { status: 404 })
  }
}

function openEditor() {
  const window = new BrowserWindow({
    title: 'Marklet',
    width: 1280,
    height: 850,
    minWidth: 420,
    minHeight: 580,
    backgroundColor: '#faf8f3',
    ...(process.platform === 'linux' ? { icon: join(app.getAppPath(), 'electron/resources/icon.png') } : {}),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  void window.loadURL(`${origin}/`)
}

void app.whenReady().then(() => {
  protocol.handle('marklet', serveEditor)
  openEditor()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openEditor()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
