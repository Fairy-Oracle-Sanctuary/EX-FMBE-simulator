# EX-FMBE Simulator

A lightweight browser-based 3D block editor and simulator built as a single `index.html` file.

## Overview

This project provides a 3D editor for Minecraft-style blocks using `Three.js` and browser-native modules. It supports:
- cube and flag block types
- variable-driven local and global transforms
- batch edit controls for multiple selected blocks
- color presets and custom texture import
- import/export of `playanimation` command text
- undo/redo, fullscreen, and scene controls

## Features

- 3D viewport with orbit controls and adjustable view
- Block selection and multi-selection
- Per-block transform variables: position, rotation, scale, extended transforms, base offset
- Custom local variables (`v.xxx`) and global variables (`t.xxx`)
- Auto-increment / value slider controls
- Batch editing when more than one block is selected
- Export commands with configurable prefix and suffix
- Import `playanimation` command text and reconstruct blocks
- Toggle axis, grid, ticks, block labels, and dark/light UI mode

## How to Run

1. Open `index.html` in a modern browser.
2. If module import restrictions occur, use a local web server, for example:
   - Python 3: `python -m http.server 8000`
   - Node.js: `npx serve .`
3. Access the page at `http://localhost:8000/`.

## Basic Usage

- Click a block in the 3D scene to select it.
- Shift-click or Ctrl-click to multi-select.
- Use the toolbar buttons to:
  - import commands
  - export generated commands
  - add materials
  - switch theme
  - add a new block
  - hide/show block labels
  - reset the camera view
- Use the variable panel to edit values and expressions.
- Press `Ctrl+Z` / `Ctrl+Y` for undo/redo.
- Press `Ctrl+D` to duplicate selected blocks.
- Press `Delete` / `Backspace` to remove selected blocks.
- Press `F11` for fullscreen.

## Export / Import

- Export: customize command prefix/suffix and generate command text for each block.
- Import: paste `playanimation` command text and the editor will parse block data.
- Flags are detected automatically when the imported command includes the marker `'方块类型：旗帜'`.

## Notes

- This simulator is self-contained in `index.html`.
- Three.js is loaded from a CDN via import maps.
- The user interface and editing logic are implemented directly in the HTML file.

## License

See `LICENSE` for license details.
