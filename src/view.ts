import { palette, toolNames, type Tool } from './annotations'
import { calloutVariants, magnifications } from './callouts'
import { icon, toolIcons } from './icons'

export const shortcutByTool: Record<Tool, string> = { select: 'V', box: 'R', highlight: 'H', arrow: 'A', text: 'T', callout: 'C' }

const tools = (Object.keys(toolNames) as Tool[]).map(tool => `
  <button class="tool-button" type="button" data-tool="${tool}" title="${toolNames[tool]} (${shortcutByTool[tool]})" aria-label="${toolNames[tool]} (${shortcutByTool[tool]})" aria-pressed="${tool === 'box'}">
    ${icon(toolIcons[tool])}<span>${toolNames[tool]}</span>
  </button>`).join('')

const swatches = palette.map(({ name, hex }) => `
  <button type="button" class="swatch" style="--swatch: ${hex}" data-color="${hex}" title="${name}" aria-label="${name}" aria-pressed="false"><span></span></button>`).join('')

const shortcuts = (Object.keys(toolNames) as Tool[]).map(tool => `<div><span>${toolNames[tool]}</span><kbd>${shortcutByTool[tool]}</kbd></div>`).join('')

const calloutStyles = Object.entries(calloutVariants).map(([key, label]) => `
  <button type="button" data-callout-variant="${key}" aria-pressed="false">
    <span class="callout-diagram" aria-hidden="true"><i></i></span><span>${label}</span>
  </button>`).join('')
const calloutZooms = magnifications.map(value => `<button type="button" data-callout-zoom="${value}" aria-pressed="false">${value}×</button>`).join('')

export const editorMarkup = `
  <header class="app-header">
    <div class="brand"><span class="brand-icon">${icon('pen')}</span><span>marklet<span class="brand-dot">.</span></span></div>
    <div class="project-actions">
      <button class="button button-quiet" id="open-project" type="button">${icon('folder')}<span>Open project</span></button>
      <button class="button button-outline" id="save-project" type="button" disabled>${icon('save')}<span>Save project</span></button>
      <button class="button button-primary" id="export-image" type="button" disabled>${icon('download')}<span>Export image</span></button>
    </div>
  </header>

  <main class="editor">
    <section class="workspace" aria-label="Image workspace">
      <div class="workspace-heading">
        <div class="project-info">
          <div class="project-heading">
            <h1><input id="project-name" aria-label="Project name" maxlength="100" value="Untitled project" size="16" disabled></h1>
            <button type="button" class="rename-button" id="rename-project" aria-label="Rename project" title="Rename project" disabled>${icon('pen')}</button>
          </div>
          <div class="image-info">${icon('fileImage')}<span id="image-name">No image loaded</span><span id="sample-badge" class="sample-badge" hidden>Example project</span></div>
        </div>
        <button class="button button-outline upload-button" id="upload-image" type="button">${icon('upload')}<span>Upload image</span></button>
      </div>

      <div class="toolbar-row">
        <div class="toolbar" role="group" aria-label="Annotation tools">
          ${tools}
          <div class="tool-divider"></div>
          <button class="icon-button history-button" id="undo" type="button" title="Undo (Ctrl or ⌘ + Z)" aria-label="Undo" disabled>${icon('undo')}</button>
          <button class="icon-button history-button" id="redo" type="button" title="Redo (Ctrl or ⌘ + Shift + Z)" aria-label="Redo" disabled>${icon('redo')}</button>
        </div>
      </div>

      <div class="canvas-area" id="canvas-area" aria-label="Annotation canvas">
        <div class="canvas-stage" id="canvas-stage">
          <div class="canvas-shell" id="canvas-shell" hidden><canvas id="artboard" aria-label="Image and annotations"></canvas></div>
          <div class="empty-state" id="empty-state">
            <span class="empty-icon">${icon('fileImage')}</span>
            <p id="empty-message">Loading example project…</p>
            <button class="button button-outline" id="empty-upload" type="button" hidden>${icon('upload')}<span>Upload image</span></button>
          </div>
        </div>
        <div class="drop-overlay" id="drop-overlay" hidden><div>${icon('upload')}<strong>Drop to open</strong><span>Image or Marklet project</span></div></div>
      </div>

      <footer class="workspace-footer">
        <div class="canvas-meta"><span id="image-size">—</span><span class="status-separator"></span><span id="document-state">Loading example</span></div>
        <div class="zoom-controls" role="group" aria-label="Zoom">
          <button class="icon-button" id="zoom-out" type="button" title="Zoom out" aria-label="Zoom out">${icon('minus')}</button>
          <span id="zoom-value" aria-live="polite">—</span>
          <button class="icon-button" id="zoom-in" type="button" title="Zoom in" aria-label="Zoom in">${icon('plus')}</button>
          <span class="tool-divider"></span>
          <button class="fit-button" id="zoom-fit" type="button" title="Fit to canvas" aria-label="Fit to canvas">${icon('scan')}<span>Fit</span></button>
        </div>
      </footer>
    </section>

    <aside class="sidebar" aria-label="Annotation controls">
      <section class="style-panel" aria-labelledby="style-title">
        <div class="section-title">${icon('sliders')}<h2 id="style-title">Style</h2></div>
        <p class="panel-context" id="style-context">Rectangle tool</p>
        <p class="panel-context" id="annotation-edit-hint" hidden></p>
        <div id="style-fields">
          <h3 id="color-label">Color</h3>
          <div class="palette" role="group" aria-labelledby="color-label">${swatches}</div>
          <div id="callout-controls" hidden>
            <fieldset class="callout-field">
              <legend>Callout style</legend>
              <div class="callout-styles">${calloutStyles}</div>
            </fieldset>
            <fieldset class="callout-field">
              <legend>Magnification</legend>
              <div class="weight-buttons">${calloutZooms}</div>
            </fieldset>
            <button class="button button-outline" id="auto-place-inset" type="button" hidden>${icon('scan')}<span>Auto-place inset</span></button>
          </div>
          <fieldset id="weight-control">
            <legend id="weight-label">Stroke width</legend>
            <div class="weight-buttons" id="weights"></div>
          </fieldset>
          <div class="opacity-control" id="opacity-control">
            <div><label for="opacity">Opacity</label><output id="opacity-value" for="opacity">100%</output></div>
            <input aria-label="Opacity" type="range" min="0" max="100" step="1" id="opacity">
          </div>
          <button class="button button-outline" id="edit-text" type="button" hidden>${icon('type')}<span>Edit text</span></button>
        </div>
        <p id="style-empty" class="panel-context" hidden>Select an annotation to edit its style.</p>
      </section>
      <section class="layers-panel" aria-labelledby="layers-title">
        <div class="section-title">${icon('layers')}<h2 id="layers-title">Annotations</h2><span class="layer-count" id="layer-count">0</span></div>
        <ul class="layers-list" id="layers"></ul>
        <p class="panel-context" id="layers-empty">Draw on the image to add an annotation.</p>
      </section>
      <footer class="sidebar-footer">
        <button id="shortcuts" type="button">${icon('circleHelp')}<span>Keyboard shortcuts</span><kbd>?</kbd></button>
      </footer>
    </aside>
  </main>

  <input id="image-input" type="file" accept="image/*" hidden>
  <input id="project-input" type="file" accept=".marklet,.json,application/json" hidden>
  <output id="toast" class="toast" role="status" hidden></output>

  <dialog id="text-dialog" aria-labelledby="text-title">
    <form id="text-form" method="dialog">
      <div class="dialog-heading"><h2 id="text-title">Add text</h2><button class="icon-button" type="button" data-close aria-label="Close">${icon('x')}</button></div>
      <label for="annotation-text">Annotation</label>
      <textarea id="annotation-text" placeholder="Enter a note…" maxlength="1500" rows="4" required></textarea>
      <div class="dialog-actions"><button class="button button-outline" type="button" data-close>Cancel</button><button id="text-submit" class="button button-primary" type="submit">Add text</button></div>
    </form>
  </dialog>

  <dialog id="export-dialog" aria-labelledby="export-title">
    <form id="export-form" method="dialog">
      <div class="dialog-heading"><h2 id="export-title">Export image</h2><button class="icon-button" type="button" data-close aria-label="Close">${icon('x')}</button></div>
      <p id="export-size"></p>
      <label for="export-format">File format</label>
      <div class="select-wrap"><select id="export-format"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option></select>${icon('chevron')}</div>
      <div class="dialog-actions"><button class="button button-outline" type="button" data-close>Cancel</button><button id="export-submit" class="button button-primary" type="submit">${icon('download')} Download image</button></div>
    </form>
  </dialog>

  <dialog id="shortcuts-dialog" aria-labelledby="shortcuts-title">
    <div class="dialog-heading"><h2 id="shortcuts-title">Keyboard shortcuts</h2><button class="icon-button" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="shortcuts-list">
      ${shortcuts}
      <div><span>Undo</span><kbd>Ctrl / ⌘ + Z</kbd></div>
      <div><span>Redo</span><kbd>Ctrl / ⌘ + Shift + Z</kbd></div>
      <div><span>Delete annotation</span><kbd>Delete</kbd></div>
      <div><span>Save project</span><kbd>Ctrl / ⌘ + S</kbd></div>
      <div><span>Fit to canvas</span><kbd>0</kbd></div>
    </div>
  </dialog>
`
