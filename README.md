# Marklet

[![Desktop CI](https://github.com/williamcotton/marklet/actions/workflows/desktop.yml/badge.svg?branch=main&event=push)](https://github.com/williamcotton/marklet/actions/workflows/desktop.yml)

Marklet is a desktop and web app for annotating screenshots with boxes, highlights, arrows, text, and magnified callouts.

## Download

- [Windows x64 installer](https://github.com/williamcotton/marklet/releases/latest/download/Marklet-windows-x64.exe)
- [macOS Apple Silicon disk image](https://github.com/williamcotton/marklet/releases/latest/download/Marklet-mac-arm64.dmg)
- [macOS Intel disk image](https://github.com/williamcotton/marklet/releases/latest/download/Marklet-mac-x64.dmg)
- [Linux x64 AppImage](https://github.com/williamcotton/marklet/releases/latest/download/Marklet-linux-x86_64.AppImage)

See the [latest release](https://github.com/williamcotton/marklet/releases/latest) for release notes. macOS builds are ad-hoc signed and unnotarized. The Windows installer is unsigned.

## Screenshots

![Marklet showing a 3D callout over a TypeScript screenshot](docs/screenshots/3d-callout.png)

![Marklet showing a code review with a box, yellow highlight, arrow, and text note](docs/screenshots/review-markup.png)

![Marklet showing PNG and JPEG export options for an annotated image](docs/screenshots/export-image.png)

## Usage

Open an image, press **C**, and drag a box around the code you want to magnify. The **3D** callout style links the enlarged inset to the original lines with a four-corner fade.

Add outlined boxes, highlights, arrows, and text to explain the rest of the screenshot. Select an annotation to edit it or click its name in the sidebar to rename it. Drag a layer by its handle to move it forward or backward in the stack. Marklet starts with a TypeScript example you can try.

Open a **.webstamp** file to annotate its capture. **Source details** shows the captured URL and timestamp. A saved **.marklet** project contains the editable layers, the original capture, and an annotated image. Export PNG or JPEG for use outside Evidence Works.

## Run from source

Use Node.js 24 LTS.

```sh
npm ci
npm run desktop
```

For the web app, run `npm run dev` and open the local URL printed by Vite.
