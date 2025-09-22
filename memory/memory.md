# Project Memory — DXF Visualizer for Mozaik
Last updated: 2025-09-21T23:02:30-04:00

## Project Overview
An Electron-based desktop app to import and visualize DXF files and convert them into structured “parts” suitable for automatic import into Mozaik software’s optimizer. The app aims to read geometry, infer dimensions, and prepare clean, consistent data for downstream optimization.

## Big Goals
- Reliable DXF import across acceptable DXF variants used in your workflow.
- Accurate, user-friendly visualization (zoom, pan, layers) with unit handling (in/mm).
- Automatic dimension extraction from DXF geometry with manual override when needed.
- Clean conversion/export to a Mozaik-compatible data format.
- Guided UX: surface issues early (units, layers, missing outer profile) with clear messages.

## Phases and Milestones
- 2025-09-21 — Repo setup and housekeeping
  - Rename default branch from “new” to “main” on GitHub. [Completed]
- 2025-09-21 — MVP: DXF Upload + Basic Visualization
  - Electron app shell, drag-and-drop UI, DXF parsing with dxf-parser, simple canvas renderer, basic dimensions and entity counts. [Completed]
- Next — DXF Semantics & Export
  - Units detection, robust bounds from polylines/arcs, outer vs inner contours, export schema for Mozaik. [Planned]
- Future — Advanced Viewer
  - Layer controls, measurement tools, snapping, panning/zooming improvements, validation reports. [Planned]

## Current Status
- Electron app runs with a modern UI: drag-and-drop DXF, displays basic info, renders simple entities on canvas.
- Automatic dimension detection implemented via bounding box of common entities (LINES/CIRCLES/ARCS/POLYLINES).
- Basic export to JSON scaffolded for Mozaik integration.
- Libraries installed: dxf-parser (parsing), groundwork laid for richer visualization.

## Next Actions (Short List)
1. Provide sample “acceptable” DXFs to validate parsing and units handling.
2. Implement robust bounds for LWPOLYLINE/ARC segments (true extents), and add units detection (DXF HEADER $INSUNITS).
3. Add toggle: auto-detected dimensions vs user-defined available space, with clear UI to override and lock values.
4. Improve renderer: support polylines with bulges, arcs; add pan/zoom controls and fit-to-view.
5. Define/export schema for Mozaik (confirm required fields, units, orientation), and validate against a test import.
6. Add error surface for malformed DXFs (quick diagnostics per decision-options rule).

## Key Decisions and Changes (Log)
- 2025-09-21 18:45 ET — Default branch renamed from “new” to “main”; old “new” deleted after default switch.
- 2025-09-21 18:55 ET — Chosen libs: dxf-parser@^1.1.2, simple canvas renderer to start; can layer in richer viewer later.
- 2025-09-21 18:56 ET — Default approach: read dimensions from DXF geometry automatically; provide user override for available space.

## Resources and References
- Repository: https://github.com/PAC837/DXFVisualizer
- NPM: dxf-parser, dxf-viewer (optional for future)
- Electron docs: https://www.electronjs.org/docs
- DXF reference: https://help.autodesk.com/view/OARX/2021/ENU/?guid=GUID-6B1B3A52-4B8F-4E7F-9C7B-5A36272C9B06

## Glossary and Shortcuts
- DXF: Drawing Exchange Format (AutoCAD)
- LWPOLYLINE: Lightweight polyline entity (may include bulge for arcs)
- Outer contour: External boundary of part; inner contours: holes/pockets
- Mozaik: Target optimization software for parts

## Metrics and KPIs (Initial)
- Import success rate on your provided samples.
- Dimension extraction accuracy vs expected drawings.
- Time to first visualization (UX speed), and error-rate for malformed inputs.
