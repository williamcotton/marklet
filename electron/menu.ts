import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'

export function installMenu(openEditor: () => BrowserWindow, editorUrl: string) {
  const isMac = process.platform === 'darwin'

  function editorItem(label: string, selector: string, accelerator?: string): MenuItemConstructorOptions {
    return {
      label,
      accelerator,
      click: () => {
        const existing = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
        if (!existing && selector !== '#upload-image' && selector !== '#open-project') return
        const window = existing ?? openEditor()
        const contents = window.webContents
        const textAction = selector === '#undo' ? 'undo' : selector === '#redo' ? 'redo' : undefined

        async function run() {
          if (contents.isDestroyed() || contents.getURL() !== editorUrl) return
          // The selectors come only from the menu definitions below. Keep file picker
          // and download actions on the same path as clicks on the editor toolbar.
          const handledByTextEditor = await contents.executeJavaScript(`(() => {
            if (${Boolean(textAction)} && document.activeElement?.matches('input, textarea, [contenteditable="true"]')) {
              return true
            }
            if (!document.querySelector('dialog[open]')) {
              document.querySelector(${JSON.stringify(selector)})?.click()
            }
            return false
          })()`, true)
          if (handledByTextEditor && textAction && !contents.isDestroyed()) contents[textAction]()
        }

        const dispatch = () => {
          void run().catch(error => console.error('Could not run Marklet menu command', error))
        }
        if (!existing || contents.isLoadingMainFrame()) contents.once('did-finish-load', dispatch)
        else dispatch()
      },
    }
  }

  const separator = { type: 'separator' } as const
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      editorItem('Open Image…', '#upload-image', 'CmdOrCtrl+Shift+O'),
      editorItem('Open Project…', '#open-project', 'CmdOrCtrl+O'),
      editorItem('Save Project…', '#save-project', 'CmdOrCtrl+S'),
      editorItem('Export Image…', '#export-image', 'CmdOrCtrl+Shift+E'),
      separator,
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    file,
    {
      label: 'Edit',
      submenu: [
        editorItem('Undo', '#undo', 'CmdOrCtrl+Z'),
        editorItem('Redo', '#redo', isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'),
        separator,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        editorItem('Zoom In', '#zoom-in', 'CmdOrCtrl+Plus'),
        editorItem('Zoom Out', '#zoom-out', 'CmdOrCtrl+-'),
        editorItem('Fit to Canvas', '#zoom-fit', 'CmdOrCtrl+0'),
        separator,
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        editorItem('Select', '[data-tool="select"]'),
        editorItem('Rectangle', '[data-tool="box"]'),
        editorItem('Highlight', '[data-tool="highlight"]'),
        editorItem('Arrow', '[data-tool="arrow"]'),
        editorItem('Text', '[data-tool="text"]'),
        editorItem('Callout', '[data-tool="callout"]'),
      ],
    },
    ...(isMac ? [{ role: 'windowMenu' as const }] : []),
    {
      role: 'help',
      submenu: [editorItem('Keyboard Shortcuts', '#shortcuts')],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
