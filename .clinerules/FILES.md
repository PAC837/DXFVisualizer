# FILES.md — Guidelines for File Organization

**Core Principle:**  
Keep code **small, modular, and separated** so the AI (and humans) don’t choke on large files.

---

## Rules

1. **File Size Limit**  
   - Aim for **≤300 lines per file**.  
   - If a file approaches 300 lines, split it into smaller logical units.  

2. **New Features = New Files**  
   - Every significant new feature or subsystem should go in its **own file**.  
   - Don’t keep adding to an already large file.  

3. **Descriptive File Names**  
   - File names should act like **mini documentation**.  
   - Example:  
     - `auth_login.py` (handles login)  
     - `auth_register.py` (handles signup)  
     - `data_import_csv.py` (imports CSV data)  

4. **One Responsibility Per File**  
   - Each file should cover **one main responsibility** or component.  
   - If it does more than one, split it.  

5. **Index / Entry Points**  
   - Use an `__init__.py` or `index.js` (depending on language) to group modules logically.  
   - Keep the entry file short—just imports and exports.  

---

## Project-Specific Notes
- ViewerContainer.tsx must remain lightweight as an orchestrator only. Any new feature or substantial logic must live in its own module under `src/components/viewer/` (UI/containers/hooks) or `src/lib/` (domain/algorithms).
- Target ≤200 lines for `ViewerContainer.tsx`; prefer ≤300 lines for all other files per this guideline.
- When adding a significant capability (e.g., clump detection, persistence, snapping), create a new descriptively named file (e.g., `zonesPipeline.ts`, `persist_zones.ts`, `snapping_index.ts`) rather than growing existing large files.
- Entry/Index files should import, wire, and export; keep them logic‑free where possible.

## Benefits
- Easier for AI to process and edit.  
- Natural “self-documenting” codebase.  
- Faster debugging (only the small module needs checking).  
- Clean separation of concerns.  

---

## One-liner Reminder
**Small files, clear names, one job each.**

---

## Project Structure (DXF Visualizer)
Target ≤300 lines per file; one responsibility each. Proposed modules:
- src/parse/dxfParser.js — thin wrapper around dxf-parser with logging and error mapping
- src/geom/bounds.js — robust bounds for LINE/ARC/CIRCLE/LWPOLYLINE (bulge-aware)
- src/units/units.js — $INSUNITS detection + UI override
- src/viewer/canvasRenderer.js — canvas draw + pan/zoom utilities
- src/export/mozaikSchema.js — schema + validator
- src/ui/controls.js — upload/controls wiring
- Entry/index files remain minimal (import/wire/export only)
