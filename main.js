/**
 * main.js — Orchestrator
 * Responsibilities:
 * - Wire UI (file input, drag/drop, buttons, units)
 * - Parse DXF (PERIMETER layer focus)
 * - Render to canvas with pan/zoom/grid + fit-to-view
 * - Close perimeter (tolerance-based)
 * - Export to versioned JSON (schemaVersion "v0.1")
 *
 * Notes:
 * - Keep this file as a lightweight controller. Heavy logic is in /src/*
 * - Preview linearizes arcs for speed; export preserves bulge values if present.
 */

import { parseDXF } from "./src/parse/dxfParser.js";
import { createCanvasRenderer } from "./src/viewer/canvasRenderer.js";
import { isClosed } from "./src/geom/closedness.js";
import { attemptClosePerimeter } from "./src/geom/join.js";

const els = {
  canvas: document.getElementById("canvas"),
  fileInput: document.getElementById("fileInput"),
  btnClearAll: document.getElementById("btnClearAll"),
  partCount: document.getElementById("partCount"),
  spacingInput: document.getElementById("spacingInput"),
  btnFit: document.getElementById("btnFit"),
  gridToggle: document.getElementById("gridToggle"),
  unitsSelect: document.getElementById("unitsSelect"),
  btnJoin: document.getElementById("btnJoin"),
  btnAutoJoin: document.getElementById("btnAutoJoin"),
  btnUnjoin: document.getElementById("btnUnjoin"),
  btnDelete: document.getElementById("btnDelete"),
  btnClearSelection: document.getElementById("btnClearSelection"),
  tolInput: document.getElementById("tolInput"),
  showDimensions: document.getElementById("showDimensions"),
  partWidth: document.getElementById("partWidth"),
  partHeight: document.getElementById("partHeight"),
  btnExportDXF: document.getElementById("btnExportDXF"),
  btnExportJSON: document.getElementById("btnExportJSON"),
  fileName: document.getElementById("fileName"),
  statusText: document.getElementById("statusText"),
  unitsLabel: document.getElementById("unitsLabel"),
  polyCount: document.getElementById("polyCount"),
  selectedCount: document.getElementById("selectedCount"),
};

const state = {
  unitsAuto: null,        // "in" | "mm" | null
  unitsOverride: "",      // "", "in", "mm"
  get units() {
    return this.unitsOverride || this.unitsAuto || "";
  },
  allPolylines: [],       // all parsed polylines (all layers)
  perimPolylines: [],     // filtered to PERIMETER
  perimClosed: false,     // whether PERIMETER perimeter is closed
  perimClosedPath: null,  // single closed path vertices when closed (for export)
  sourceName: "",         // last loaded filename (without extension)
  selectedPolylines: new Set(), // indices of selected polylines
  closedParts: new Set(), // indices of polylines that are complete closed parts (rendered blue)
  draggingPart: null,     // { partIndex: number, startX: number, startY: number, lastX: number, lastY: number }
  history: [],            // Undo/redo history
  historyIndex: -1,       // Current position in history
};

const renderer = createCanvasRenderer(els.canvas, {
  grid: false,
  onTransform: () => {},
  selectedIndices: state.selectedPolylines,
  closedParts: state.closedParts, // Indices of closed parts (rendered blue)
  onPolylineClick: (polylineIndex, shiftKey) => {
    handlePolylineClick(polylineIndex, shiftKey);
  },
  onPartDragStart: (partIndex, canvasX, canvasY) => {
    handlePartDragStart(partIndex, canvasX, canvasY);
  },
  onPartDrag: (canvasX, canvasY) => {
    handlePartDrag(canvasX, canvasY);
  },
  onPartDragEnd: () => {
    handlePartDragEnd();
  },
  onSelectionDrag: (selectedIndices, shiftKey) => {
    handleSelectionDrag(selectedIndices, shiftKey);
  },
});

function setStatus(msg) {
  els.statusText.textContent = msg;
}

function setUnitsLabel() {
  const label = state.units || "—";
  els.unitsLabel.textContent = label;
}

function setPolyCount() {
  els.polyCount.textContent = String(state.perimPolylines.length);
}

function enableActions() {
  const hasData = state.perimPolylines.length > 0;
  const hasSelection = state.selectedPolylines.size > 0;
  
  els.btnFit.disabled = !hasData;
  els.btnAutoJoin.disabled = !hasData;
  els.btnUnjoin.disabled = !hasSelection; // Enable when polylines are selected
  els.btnDelete.disabled = !hasSelection;

  const tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
  const closed = computeClosedness(state.perimPolylines, tol);
  state.perimClosed = closed;

  // Export buttons are enabled when we have data (for DXF) and closed perimeter (for JSON)
  els.btnExportDXF.disabled = !hasData; // DXF export works with any polylines
  els.btnExportJSON.disabled = !closed; // JSON export requires closed perimeter
  
  // Update dimensions
  updateDimensions();
  
  console.log("[EXPORT] DXF export disabled:", !hasData, "JSON export disabled:", !closed, "Has closed perimeter:", closed);
}

function computeClosedness(polys, tol) {
  if (!polys || polys.length === 0) return false;

  if (polys.length === 1) {
    const p = polys[0];
    return p.closed || isClosed(p.vertices, tol);
  }

  // Multiple polylines on PERIMETER layer —
  // treat as not closed until user runs "Close Perimeter".
  return false;
}

function filterPerimeter(polys) {
  // Show ALL polylines from any layer (not just PERIMETER)
  console.log("[DXF-FILTER] Input polylines:", polys.length, polys);
  return polys; // Return all polylines regardless of layer
}

function onDXFParsed(result, filenameBase) {
  console.log("[DXF-PARSE] onDXFParsed called with result:", result);
  state.unitsAuto = result.unitsAuto || null;
  setUnitsLabel();

  state.allPolylines = result.polylines || [];
  console.log("[DXF-PARSE] All polylines found:", state.allPolylines.length, state.allPolylines);
  
  state.perimPolylines = filterPerimeter(state.allPolylines);
  console.log("[DXF-PARSE] PERIMETER polylines:", state.perimPolylines.length, state.perimPolylines);
  
  state.sourceName = filenameBase || "mozaik-part";

  // update UI
  setPolyCount();
  if (els.fileName && !els.fileName.value) {
    els.fileName.value = state.sourceName;
  }

  // render
  console.log("[DXF-RENDER] Sending to renderer:", state.perimPolylines);
  renderer.setData(state.perimPolylines);
  renderer.fitToView();

  enableActions();
  const layerInfo = `Parsed ${state.allPolylines.length} polylines; PERIMETER: ${state.perimPolylines.length}`;
  setStatus(`Loaded. ${layerInfo}`);
}

async function handleTextLoad(text, filename = "") {
  try {
    setStatus("Parsing DXF…");
    console.log("[DXF-PARSE] Starting parse of", filename, "text length:", text.length);
    const parsed = parseDXF(text);
    console.log("[DXF-PARSE] Raw parsed result:", parsed);
    const base = (filename || "").replace(/\.[^.]+$/, "");
    onDXFParsed(parsed, base);
  } catch (err) {
    console.error("[ERROR] parseDXF failed:", err);
    setStatus("Failed to parse DXF. See console for details.");
  }
}

function wireFileInput() {
  els.fileInput?.addEventListener("change", async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    console.log("[MULTI-DXF] Loading", files.length, "files");
    await handleMultipleFiles(Array.from(files));
  });
}

function wireDragDrop() {
  const target = els.canvas;
  const prevent = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  ["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
    target.addEventListener(evt, prevent);
  });
  target.addEventListener("drop", async (ev) => {
    const files = ev.dataTransfer?.files;
    if (!files || files.length === 0) return;
    
    console.log("[MULTI-DXF] Dropping", files.length, "files");
    await handleMultipleFiles(Array.from(files));
  });
}

async function handleMultipleFiles(files) {
  if (files.length === 1) {
    // Single file - use existing logic
    const file = files[0];
    const text = await file.text();
    await handleTextLoad(text, file.name);
    return;
  }
  
  // Multiple files - clear existing and load all with spacing
  state.allPolylines = [];
  state.perimPolylines = [];
  clearSelection();
  
  const spacing = parseFloat(els.spacingInput?.value || "2.0") || 2.0;
  let currentOffsetX = 0;
  let partCount = 0;
  let filesProcessed = 0;
  let skippedFiles = [];
  let errorFiles = [];
  
  for (const file of files) {
    try {
      filesProcessed++;
      setStatus(`Loading ${file.name}... (${filesProcessed}/${files.length})`);
      console.log("[MULTI-DXF] Processing file:", file.name);
      
      const text = await file.text();
      const parsed = parseDXF(text);
      const polylines = filterPerimeter(parsed.polylines || []);
      
      if (polylines.length === 0) {
        console.log("[MULTI-DXF] No polylines found in", file.name, "- skipping empty file");
        skippedFiles.push(file.name);
        continue;
      }
      
      // Calculate bounds of this part
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const poly of polylines) {
        for (const v of poly.vertices || []) {
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
      }
      
      console.log("[MULTI-DXF] Part bounds:", file.name, "X:", minX.toFixed(3), "to", maxX.toFixed(3), "Width:", (maxX - minX).toFixed(3));
      
      // Offset all polylines to start at currentOffsetX (normalize to 0 first)
      const offsetPolylines = polylines.map(poly => ({
        ...poly,
        vertices: poly.vertices.map(v => ({
          ...v,
          x: (v.x - minX) + currentOffsetX, // Normalize then offset
          y: v.y - minY // Normalize Y to start at 0
        })),
        partName: file.name.replace(/\.[^.]+$/, "") // Store part name
      }));
      
      state.perimPolylines.push(...offsetPolylines);
      partCount++;
      
      // Update offset for next part - use actual width + spacing
      if (isFinite(maxX) && isFinite(minX)) {
        const partWidth = maxX - minX;
        currentOffsetX += partWidth + spacing;
        console.log("[MULTI-DXF] Next offset will be:", currentOffsetX.toFixed(3), "(part width:", partWidth.toFixed(3), "+ spacing:", spacing, ")");
      } else {
        currentOffsetX += spacing;
      }
      
      console.log("[MULTI-DXF] Added", polylines.length, "polylines from", file.name, "at offset", currentOffsetX - spacing);
      
    } catch (err) {
      console.error("[MULTI-DXF] Failed to load", file.name, ":", err);
      errorFiles.push(`${file.name}: ${err.message}`);
    }
  }
  
  if (partCount > 0) {
    // Update UI
    els.partCount.textContent = String(partCount);
    els.btnClearAll.disabled = false;
    setPolyCount();
    
    // Set units from first valid file
    setUnitsLabel();
    
    // Render
    renderer.setData(state.perimPolylines);
    renderer.fitToView();
    
    enableActions();
    
    // Build detailed status message
    let statusMsg = `Loaded ${partCount} parts from ${filesProcessed} files with ${state.perimPolylines.length} total polylines.`;
    
    if (skippedFiles.length > 0) {
      statusMsg += ` Skipped ${skippedFiles.length} empty file(s): ${skippedFiles.join(", ")}.`;
    }
    
    if (errorFiles.length > 0) {
      statusMsg += ` Failed ${errorFiles.length} file(s): ${errorFiles.join("; ")}.`;
    }
    
    setStatus(statusMsg);
    console.log("[MULTI-DXF] Final result:", partCount, "parts from", filesProcessed, "files.", 
      "Skipped:", skippedFiles.length, "Error:", errorFiles.length);
  } else {
    let statusMsg = `No valid parts loaded from ${filesProcessed} files.`;
    
    if (skippedFiles.length > 0) {
      statusMsg += ` ${skippedFiles.length} empty: ${skippedFiles.join(", ")}.`;
    }
    
    if (errorFiles.length > 0) {
      statusMsg += ` ${errorFiles.length} failed: ${errorFiles.join("; ")}.`;
    }
    
    setStatus(statusMsg);
  }
}

function wireView() {
  els.btnFit?.addEventListener("click", () => renderer.fitToView());
  els.gridToggle?.addEventListener("change", (e) => {
    const checked = !!e.target.checked;
    renderer.setGrid(checked);
    renderer.render();
  });
}

function wireUnits() {
  els.unitsSelect?.addEventListener("change", (e) => {
    state.unitsOverride = e.target.value; // "", "in", "mm"
    setUnitsLabel();
    // We don't rescale geometry; units are metadata for export and UI.
  });
}

function wireClose() {
  els.btnClose?.addEventListener("click", () => {
    const tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
    const result = attemptClosePerimeter(state.perimPolylines, tol);
    if (!result || !result.closed) {
      setStatus("Close failed: Could not join into a closed path with current tolerance.");
      return;
    }
    // Replace current PERIMETER data with the single closed path for viewing and export
    state.perimClosedPath = { vertices: result.vertices, closed: true, layer: "PERIMETER" };
    state.perimPolylines = [state.perimClosedPath];
    renderer.setData(state.perimPolylines);
    renderer.fitToView();
    enableActions();
    setStatus(`Perimeter closed with tolerance ${tol}.`);
  });
}

function download(filename, dataText, mimeType = "application/json") {
  const blob = new Blob([dataText], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toDXFFormat(polylines, filename) {
  const units = state.units || "in";
  const insunitsValue = units === "mm" ? 4 : 1; // 1=inches, 4=millimeters
  
  let dxfContent = `999
DXF Convert App - Exported ${new Date().toISOString()}
0
SECTION
2
HEADER
9
$INSUNITS
70
${insunitsValue}
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
5
2
100
AcDbSymbolTable
70
2
0
LAYER
5
10
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
0
70
0
62
7
6
CONTINUOUS
0
LAYER
5
11
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
JOINED
70
0
62
3
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Add polylines
  polylines.forEach((poly, index) => {
    const vertices = poly.vertices || [];
    if (vertices.length < 2) return;
    
    const layer = poly.layer || "0";
    const isClosed = poly.closed || false;
    const flags = isClosed ? 1 : 0;
    
    dxfContent += `0
LWPOLYLINE
5
${(100 + index).toString(16).toUpperCase()}
100
AcDbEntity
8
${layer}
100
AcDbPolyline
90
${vertices.length}
70
${flags}
`;

    // Add vertices
    vertices.forEach(v => {
      dxfContent += `10
${v.x.toFixed(6)}
20
${v.y.toFixed(6)}
`;
      if (v.bulge && v.bulge !== 0) {
        dxfContent += `42
${v.bulge.toFixed(6)}
`;
      }
    });
  });

  dxfContent += `0
ENDSEC
0
EOF
`;

  return dxfContent;
}

function toExportSchema(name) {
  const units = state.units || "in";
  const partName = name?.trim() || state.sourceName || "mozaik-part";
  const poly = state.perimClosedPath || state.perimPolylines?.[0];
  const vertices = (poly?.vertices || []).map((v) => {
    const out = { x: v.x, y: v.y };
    if (typeof v.bulge === "number" && !Number.isNaN(v.bulge) && v.bulge !== 0) {
      out.bulge = v.bulge;
    }
    return out;
  });

  return {
    schemaVersion: "v0.1",
    meta: {
      source: "DXF Convert App",
      exportedAt: new Date().toISOString(),
    },
    units,
    parts: [
      {
        name: partName,
        perimeter: {
          closed: true,
          vertices,
        },
      },
    ],
  };
}

function wireExport() {
  // DXF Export
  els.btnExportDXF?.addEventListener("click", () => {
    try {
      const fname = (els.fileName?.value || "mozaik-part").replace(/\.(dxf|json)$/i, "");
      const dxfContent = toDXFFormat(state.perimPolylines, fname);
      download(`${fname}.dxf`, dxfContent, "application/dxf");
      setStatus("Exported to DXF format.");
      console.log("[EXPORT-DXF] Exported", state.perimPolylines.length, "polylines to", `${fname}.dxf`);
    } catch (err) {
      console.error("[ERROR] DXF export failed:", err);
      setStatus("DXF export failed. See console.");
    }
  });

  // JSON Export  
  els.btnExportJSON?.addEventListener("click", () => {
    try {
      const fname = (els.fileName?.value || "mozaik-part").replace(/\.(dxf|json)$/i, "");
      const payload = toExportSchema(fname);
      download(`${fname}.json`, JSON.stringify(payload, null, 2), "application/json");
      setStatus("Exported JSON v0.1 for Mozaik.");
      console.log("[EXPORT-JSON] Exported closed perimeter to", `${fname}.json`);
    } catch (err) {
      console.error("[ERROR] JSON export failed:", err);
      setStatus("JSON export failed. See console.");
    }
  });
}

// Debug logging system
const debugLogs = [];
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
};

// Override console methods to capture logs
console.log = (...args) => {
  debugLogs.push({ type: 'log', time: new Date().toLocaleTimeString(), args });
  originalConsole.log(...args);
};
console.error = (...args) => {
  debugLogs.push({ type: 'error', time: new Date().toLocaleTimeString(), args });
  originalConsole.error(...args);
};
console.warn = (...args) => {
  debugLogs.push({ type: 'warn', time: new Date().toLocaleTimeString(), args });
  originalConsole.warn(...args);
};

function showDebugModal() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8); z-index: 1000;
    display: flex; align-items: center; justify-content: center;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #111827; border: 1px solid #374151;
    border-radius: 8px; width: 80%; max-width: 800px; height: 70%;
    display: flex; flex-direction: column; color: #e5e7eb;
  `;
  
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 16px; border-bottom: 1px solid #374151;
    display: flex; justify-content: space-between; align-items: center;
  `;
  header.innerHTML = `
    <h3 style="margin: 0; color: #e5e7eb;">Debug Console</h3>
    <button style="background: #7c2d12; border: 1px solid #b45309; color: #e5e7eb; 
                   padding: 4px 12px; border-radius: 4px; cursor: pointer;">Close</button>
  `;
  
  const logContainer = document.createElement('div');
  logContainer.style.cssText = `
    flex: 1; padding: 16px; overflow-y: auto;
    font-family: 'Courier New', monospace; font-size: 12px;
    background: #0a0f21;
  `;
  
  // Populate logs
  const logsHtml = debugLogs.map(log => {
    const color = log.type === 'error' ? '#ef4444' : log.type === 'warn' ? '#f59e0b' : '#22c55e';
    const argsStr = log.args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    return `<div style="color: ${color}; margin-bottom: 8px;">
      [${log.time}] ${argsStr}
    </div>`;
  }).join('');
  
  logContainer.innerHTML = logsHtml || '<div style="color: #6b7280;">No debug logs yet. Try loading a DXF file.</div>';
  
  // Auto scroll to bottom
  setTimeout(() => logContainer.scrollTop = logContainer.scrollHeight, 100);
  
  modal.appendChild(header);
  modal.appendChild(logContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  // Close handlers
  const closeBtn = header.querySelector('button');
  const closeModal = () => document.body.removeChild(overlay);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
}

// Selection management
function handlePolylineClick(polylineIndex, shiftKey) {
  console.log("[SELECTION] Clicked polyline", polylineIndex, "shift:", shiftKey);
  
  if (!shiftKey) {
    // Clear selection and select only this one
    state.selectedPolylines.clear();
  }
  
  // Toggle selection
  if (state.selectedPolylines.has(polylineIndex)) {
    state.selectedPolylines.delete(polylineIndex);
  } else {
    state.selectedPolylines.add(polylineIndex);
  }
  
  updateSelectionUI();
  renderer.render(); // Re-render to show selection
}

// Drag selection handler
function handleSelectionDrag(selectedIndices, shiftKey) {
  console.log("[DRAG-SELECTION] Selected", selectedIndices.length, "polylines:", selectedIndices, "shift:", shiftKey);
  
  if (!shiftKey) {
    // Clear existing selection
    state.selectedPolylines.clear();
  }
  
  // Add/toggle dragged selection
  for (const idx of selectedIndices) {
    if (shiftKey && state.selectedPolylines.has(idx)) {
      // Shift+drag: toggle selection (remove if already selected)
      state.selectedPolylines.delete(idx);
    } else {
      // Normal drag: add to selection
      state.selectedPolylines.add(idx);
    }
  }
  
  updateSelectionUI();
  renderer.render(); // Re-render to show selection
  
  if (selectedIndices.length === 0) {
    setStatus("No polylines found in selection area.");
  } else {
    const actionStr = shiftKey ? "Added/toggled" : "Selected";
    setStatus(`${actionStr} ${selectedIndices.length} polylines via drag selection.`);
  }
}

function updateSelectionUI() {
  const count = state.selectedPolylines.size;
  els.selectedCount.textContent = String(count);
  
  // Enable/disable selection-related buttons
  els.btnClearSelection.disabled = count === 0;
  els.btnJoin.disabled = count < 2; // Need at least 2 to join
  els.btnUnjoin.disabled = count === 0; // Need at least 1 to unjoin
  els.btnDelete.disabled = count === 0; // Need at least 1 to delete
  
  console.log("[SELECTION-UI] Count:", count, "Unjoin disabled:", count === 0, "Delete disabled:", count === 0);
  
  if (count === 0) {
    setStatus("No lines selected. Click to select, Shift+Click for multi-select.");
  } else if (count === 1) {
    setStatus(`1 line selected. Use Unjoin/Delete buttons or Shift+Click more lines to join.`);
  } else {
    setStatus(`${count} lines selected. Click Join to connect them.`);
  }
}

// Undo/Redo system
function saveState(action = "Unknown Action") {
  const currentState = {
    perimPolylines: JSON.parse(JSON.stringify(state.perimPolylines)),
    selectedPolylines: new Set(state.selectedPolylines),
    action: action,
    timestamp: Date.now()
  };
  
  // Remove any states after current index (when we're in the middle of history)
  state.history = state.history.slice(0, state.historyIndex + 1);
  
  // Add new state
  state.history.push(currentState);
  state.historyIndex = state.history.length - 1;
  
  // Limit history size to prevent memory issues
  const maxHistory = 50;
  if (state.history.length > maxHistory) {
    state.history.shift();
    state.historyIndex--;
  }
  
  console.log("[UNDO-REDO] Saved state:", action, "- History index:", state.historyIndex, "Total states:", state.history.length);
}

function undo() {
  if (state.historyIndex <= 0) {
    setStatus("Nothing to undo.");
    return false;
  }
  
  state.historyIndex--;
  const savedState = state.history[state.historyIndex];
  
  // Restore state
  state.perimPolylines = JSON.parse(JSON.stringify(savedState.perimPolylines));
  state.selectedPolylines = new Set(savedState.selectedPolylines);
  
  // Update UI - closedParts will be recalculated from geometry
  updateSelectionUI();
  updateClosedParts(); // This will properly recalculate closed parts from current geometry
  
  // IMPORTANT: Re-sync renderer with current state references
  renderer.setData(state.perimPolylines);
  renderer.selectedIndices = state.selectedPolylines;
  renderer.closedParts = state.closedParts;
  renderer.render(); // Force re-render to ensure click detection works
  
  setPolyCount();
  enableActions();
  
  setStatus(`Undo: ${savedState.action}`);
  console.log("[UNDO] Restored state:", savedState.action, "- Now at index:", state.historyIndex, "- Polylines:", state.perimPolylines.length);
  return true;
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) {
    setStatus("Nothing to redo.");
    return false;
  }
  
  state.historyIndex++;
  const savedState = state.history[state.historyIndex];
  
  // Restore state
  state.perimPolylines = JSON.parse(JSON.stringify(savedState.perimPolylines));
  state.selectedPolylines = new Set(savedState.selectedPolylines);
  
  // Update UI - closedParts will be recalculated from geometry
  updateSelectionUI();
  updateClosedParts(); // This will properly recalculate closed parts from current geometry
  
  // IMPORTANT: Re-sync renderer with current state references
  renderer.setData(state.perimPolylines);
  renderer.selectedIndices = state.selectedPolylines;
  renderer.closedParts = state.closedParts;
  renderer.render(); // Force re-render to ensure click detection works
  
  setPolyCount();
  enableActions();
  
  setStatus(`Redo: ${savedState.action}`);
  console.log("[REDO] Restored state:", savedState.action, "- Now at index:", state.historyIndex, "- Polylines:", state.perimPolylines.length);
  return true;
}

function clearSelection() {
  state.selectedPolylines.clear();
  updateSelectionUI();
  enableActions(); // Update button states
  renderer.render();
}

// Detect closed parts and update the closedParts set
function updateClosedParts() {
  const tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
  state.closedParts.clear();
  
  for (let i = 0; i < state.perimPolylines.length; i++) {
    const poly = state.perimPolylines[i];
    if (!poly?.vertices || poly.vertices.length < 3) continue;
    
    // Check if polyline is closed (either explicitly or geometrically)
    const isPolylineClosed = poly.closed || isClosed(poly.vertices, tol);
    
    if (isPolylineClosed) {
      state.closedParts.add(i);
      console.log("[CLOSED-PARTS] Polyline", i, "is a closed part (blue)");
    }
  }
  
  console.log("[CLOSED-PARTS] Found", state.closedParts.size, "closed parts:", Array.from(state.closedParts));
}

// Part dragging handlers
function handlePartDragStart(partIndex, canvasX, canvasY) {
  if (!state.closedParts.has(partIndex)) return; // Only allow dragging blue parts
  
  // Save state before starting drag
  saveState("Move Part");
  
  state.draggingPart = {
    partIndex,
    startX: canvasX,
    startY: canvasY,
    lastX: canvasX,
    lastY: canvasY
  };
  
  console.log("[PART-DRAG] Started dragging closed part", partIndex, "at", canvasX.toFixed(2), canvasY.toFixed(2));
  setStatus(`Dragging part ${partIndex}... Press R to rotate.`);
}

// Part rotation function
function rotatePart(partIndex, angleDegrees = 90) {
  const poly = state.perimPolylines[partIndex];
  if (!poly?.vertices) return false;
  
  // Calculate center of the part
  let centerX = 0, centerY = 0;
  for (const v of poly.vertices) {
    centerX += v.x;
    centerY += v.y;
  }
  centerX /= poly.vertices.length;
  centerY /= poly.vertices.length;
  
  // Convert angle to radians
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  
  // Rotate each vertex around the center
  for (const vertex of poly.vertices) {
    const dx = vertex.x - centerX;
    const dy = vertex.y - centerY;
    vertex.x = centerX + (dx * cos - dy * sin);
    vertex.y = centerY + (dx * sin + dy * cos);
  }
  
  console.log("[PART-ROTATE] Rotated part", partIndex, "by", angleDegrees, "degrees around center", centerX.toFixed(2), centerY.toFixed(2));
  return true;
}

function handlePartDrag(canvasX, canvasY) {
  if (!state.draggingPart) return;
  
  const drag = state.draggingPart;
  const deltaX = canvasX - drag.lastX;
  const deltaY = canvasY - drag.lastY;
  
  // Move all vertices of the dragged part
  const poly = state.perimPolylines[drag.partIndex];
  if (poly?.vertices) {
    for (const vertex of poly.vertices) {
      vertex.x += deltaX;
      vertex.y += deltaY;
    }
  }
  
  // Update drag position
  drag.lastX = canvasX;
  drag.lastY = canvasY;
  
  // Update renderer with new data
  renderer.setData(state.perimPolylines);
  renderer.render();
  
  // Update dimensions
  updateDimensions();
}

function handlePartDragEnd() {
  if (!state.draggingPart) return;
  
  const drag = state.draggingPart;
  const totalDeltaX = drag.lastX - drag.startX;
  const totalDeltaY = drag.lastY - drag.startY;
  
  console.log("[PART-DRAG] Finished dragging part", drag.partIndex, 
    "moved by", totalDeltaX.toFixed(2), ",", totalDeltaY.toFixed(2));
  
  setStatus(`Moved part ${drag.partIndex} by ${totalDeltaX.toFixed(2)}, ${totalDeltaY.toFixed(2)}`);
  
  state.draggingPart = null;
}

// Dimensions calculation
function updateDimensions() {
  if (!state.perimPolylines.length) {
    els.partWidth.textContent = "—";
    els.partHeight.textContent = "—";
    return;
  }

  // Calculate overall bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const poly of state.perimPolylines) {
    for (const v of poly.vertices || []) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  
  if (!isFinite(minX)) {
    els.partWidth.textContent = "—";
    els.partHeight.textContent = "—";
    return;
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  const units = state.units || "";
  
  els.partWidth.textContent = `${width.toFixed(3)} ${units}`.trim();
  els.partHeight.textContent = `${height.toFixed(3)} ${units}`.trim();
  
  console.log("[DIMENSIONS] Width:", width.toFixed(3), "Height:", height.toFixed(3), "Units:", units);
}

// Distance between two points
function distance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Join two polylines if their endpoints are close
function joinTwoPolylines(poly1, poly2, tolerance) {
  const p1Start = poly1.vertices[0];
  const p1End = poly1.vertices[poly1.vertices.length - 1];
  const p2Start = poly2.vertices[0];
  const p2End = poly2.vertices[poly2.vertices.length - 1];
  
  console.log("[JOIN-TWO] Checking distances:");
  console.log("  p1End to p2Start:", distance(p1End, p2Start).toFixed(6));
  console.log("  p1End to p2End:", distance(p1End, p2End).toFixed(6));
  console.log("  p1Start to p2Start:", distance(p1Start, p2Start).toFixed(6));
  console.log("  p1Start to p2End:", distance(p1Start, p2End).toFixed(6));
  console.log("  Tolerance:", tolerance);
  
  // Try different connection combinations
  if (distance(p1End, p2Start) <= tolerance) {
    // Connect p1End to p2Start: p1 + p2[1...]
    const result = [...poly1.vertices, ...poly2.vertices.slice(1)];
    console.log("[JOIN-TWO] Connected p1End to p2Start");
    return { vertices: result, closed: false, layer: "JOINED" };
  }
  
  if (distance(p1End, p2End) <= tolerance) {
    // Connect p1End to p2End: p1 + p2.reverse()[1...]
    const p2Rev = [...poly2.vertices].reverse();
    const result = [...poly1.vertices, ...p2Rev.slice(1)];
    console.log("[JOIN-TWO] Connected p1End to p2End (reversed p2)");
    return { vertices: result, closed: false, layer: "JOINED" };
  }
  
  if (distance(p1Start, p2Start) <= tolerance) {
    // Connect p1Start to p2Start: p1.reverse() + p2[1...]
    const p1Rev = [...poly1.vertices].reverse();
    const result = [...p1Rev, ...poly2.vertices.slice(1)];
    console.log("[JOIN-TWO] Connected p1Start to p2Start (reversed p1)");
    return { vertices: result, closed: false, layer: "JOINED" };
  }
  
  if (distance(p1Start, p2End) <= tolerance) {
    // Connect p1Start to p2End: p2 + p1[1...]
    const result = [...poly2.vertices, ...poly1.vertices.slice(1)];
    console.log("[JOIN-TWO] Connected p1Start to p2End");
    return { vertices: result, closed: false, layer: "JOINED" };
  }
  
  console.log("[JOIN-TWO] No connection found within tolerance");
  return null;
}

// Auto-join all polylines
function autoJoinAll() {
  let tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
  
  // Use a more generous tolerance for auto-join
  tol = Math.max(tol, 0.01); // At least 0.01 units
  
  console.log("[AUTO-JOIN] Starting auto-join with tolerance:", tol);
  console.log("[AUTO-JOIN] Starting with", state.perimPolylines.length, "polylines");
  
  let joinedAny = false;
  let iterations = 0;
  const maxIterations = 20; // Allow more iterations
  
  while (iterations < maxIterations) {
    iterations++;
    let foundConnection = false;
    
    console.log("[AUTO-JOIN] Iteration", iterations, "- checking", state.perimPolylines.length, "polylines");
    
    // Try to join each polyline with others
    for (let i = 0; i < state.perimPolylines.length - 1; i++) {
      for (let j = i + 1; j < state.perimPolylines.length; j++) {
        const poly1 = state.perimPolylines[i];
        const poly2 = state.perimPolylines[j];
        
        if (!poly1?.vertices?.length || !poly2?.vertices?.length) continue;
        if (poly1.vertices.length < 2 || poly2.vertices.length < 2) continue;
        
        console.log("[AUTO-JOIN] Trying to join polyline", i, "with", j);
        const result = joinTwoPolylines(poly1, poly2, tol);
        
        if (result) {
          console.log("[AUTO-JOIN] Successfully joined polylines", i, "and", j);
          
          // Remove the two original polylines (j first to maintain indices)
          state.perimPolylines.splice(j, 1);
          state.perimPolylines.splice(i, 1);
          
          // Add the new joined polyline
          state.perimPolylines.push(result);
          
          foundConnection = true;
          joinedAny = true;
          break; // Start over with new array
        }
      }
      if (foundConnection) break;
    }
    
    if (!foundConnection) {
      console.log("[AUTO-JOIN] No more connections possible after", iterations, "iterations");
      break;
    }
  }
  
  if (joinedAny) {
    clearSelection();
    updateClosedParts(); // Check for newly closed parts (blue)
    renderer.setData(state.perimPolylines);
    setPolyCount();
    enableActions();
    setStatus(`Auto-join completed. ${state.perimPolylines.length} polylines remaining.`);
    console.log("[AUTO-JOIN] Completed after", iterations, "iterations. Final count:", state.perimPolylines.length);
  } else {
    setStatus(`Auto-join found no connections within tolerance ${tol.toFixed(3)}. Try increasing tolerance.`);
    console.log("[AUTO-JOIN] No connections found within tolerance", tol);
  }
}

// Unjoin selected polylines - break them into individual segments
function unjoinSelected() {
  if (state.selectedPolylines.size === 0) return;
  
  const selectedIndices = Array.from(state.selectedPolylines);
  console.log("[UNJOIN] Checking polylines at indices:", selectedIndices);
  
  // Filter for polylines that can actually be unjoined (3+ vertices)
  const unjoinableIndices = [];
  const singleLineIndices = [];
  
  for (const idx of selectedIndices) {
    const poly = state.perimPolylines[idx];
    if (!poly?.vertices) continue;
    
    if (poly.vertices.length >= 3) {
      unjoinableIndices.push(idx);
      console.log("[UNJOIN] Polyline", idx, "can be unjoined (", poly.vertices.length, "vertices)");
    } else {
      singleLineIndices.push(idx);
      console.log("[UNJOIN] Polyline", idx, "is already a single line segment (", poly.vertices.length, "vertices)");
    }
  }
  
  // If no polylines can be unjoined, show message
  if (unjoinableIndices.length === 0) {
    if (singleLineIndices.length > 0) {
      setStatus(`Cannot unjoin: Selected lines are already individual segments. Use Delete to remove them.`);
    } else {
      setStatus(`No valid polylines selected for unjoining.`);
    }
    return;
  }
  
  let newPolylines = [];
  let totalSegments = 0;
  
  // Process only the unjoinable polylines
  const sortedUnjoinable = unjoinableIndices.sort((a, b) => b - a);
  for (const idx of sortedUnjoinable) {
    const poly = state.perimPolylines[idx];
    console.log("[UNJOIN] Breaking polyline with", poly.vertices.length, "vertices");
    
    // Break polyline into 2-point segments (individual lines)
    for (let i = 0; i < poly.vertices.length - 1; i++) {
      const segment = {
        vertices: [poly.vertices[i], poly.vertices[i + 1]],
        closed: false,
        layer: "UNJOINED"
      };
      newPolylines.push(segment);
      totalSegments++;
    }
    
    // If original was closed, add closing segment
    if (poly.closed && poly.vertices.length > 2) {
      const closingSegment = {
        vertices: [poly.vertices[poly.vertices.length - 1], poly.vertices[0]], 
        closed: false,
        layer: "UNJOINED"
      };
      newPolylines.push(closingSegment);
      totalSegments++;
    }
  }
  
  // Remove only the unjoinable polylines (in reverse order to maintain indices)
  for (const idx of sortedUnjoinable) {
    state.perimPolylines.splice(idx, 1);
  }
  
  // Add new segments
  state.perimPolylines.push(...newPolylines);
  
  clearSelection();
  renderer.setData(state.perimPolylines);
  setPolyCount();
  enableActions();
  
  if (singleLineIndices.length > 0) {
    setStatus(`Unjoined ${unjoinableIndices.length} polylines into ${totalSegments} segments. ${singleLineIndices.length} single lines left unchanged.`);
  } else {
    setStatus(`Unjoined ${unjoinableIndices.length} polylines into ${totalSegments} individual line segments.`);
  }
  console.log("[UNJOIN] Created", totalSegments, "segments from", unjoinableIndices.length, "polylines");
}

// Delete selected polylines
function deleteSelected() {
  if (state.selectedPolylines.size === 0) return;
  
  const selectedIndices = Array.from(state.selectedPolylines).sort((a, b) => b - a);
  console.log("[DELETE] Deleting polylines at indices:", selectedIndices);
  
  // Remove selected polylines (in reverse order to maintain indices)
  for (const idx of selectedIndices) {
    state.perimPolylines.splice(idx, 1);
  }
  
  clearSelection();
  renderer.setData(state.perimPolylines);
  setPolyCount();
  enableActions();
  setStatus(`Deleted ${selectedIndices.length} lines.`);
}

function wireSelection() {
  els.btnClearSelection?.addEventListener('click', () => {
    clearSelection();
  });
  
  els.btnJoin?.addEventListener('click', () => {
    const selectedIndices = Array.from(state.selectedPolylines);
    if (selectedIndices.length < 2) {
      setStatus("Need at least 2 lines selected to join.");
      return;
    }
    
    saveState("Manual Join Selected");
    const selectedPolys = selectedIndices.map(i => state.perimPolylines[i]);
    const tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
    
    console.log("[MANUAL-JOIN] Joining", selectedPolys.length, "selected polylines with tolerance:", tol);
    
    // Try to join selected polylines iteratively (like auto-join but only selected ones)
    let workingPolys = [...selectedPolys];
    let joinedAny = false;
    let iterations = 0;
    const maxIterations = 10;
    
    while (iterations < maxIterations && workingPolys.length > 1) {
      iterations++;
      let foundConnection = false;
      
      console.log("[MANUAL-JOIN] Iteration", iterations, "- checking", workingPolys.length, "polylines");
      
      // Try to join each polyline with others
      for (let i = 0; i < workingPolys.length - 1; i++) {
        for (let j = i + 1; j < workingPolys.length; j++) {
          const poly1 = workingPolys[i];
          const poly2 = workingPolys[j];
          
          if (!poly1?.vertices?.length || !poly2?.vertices?.length) continue;
          if (poly1.vertices.length < 2 || poly2.vertices.length < 2) continue;
          
          const result = joinTwoPolylines(poly1, poly2, tol);
          
          if (result) {
            console.log("[MANUAL-JOIN] Successfully joined selected polylines", i, "and", j);
            
            // Remove the two original polylines (j first to maintain indices)
            workingPolys.splice(j, 1);
            workingPolys.splice(i, 1);
            
            // Add the new joined polyline
            workingPolys.push(result);
            
            foundConnection = true;
            joinedAny = true;
            break; // Start over with new array
          }
        }
        if (foundConnection) break;
      }
      
      if (!foundConnection) {
        console.log("[MANUAL-JOIN] No more connections possible after", iterations, "iterations");
        break;
      }
    }
    
    if (joinedAny) {
      // Remove selected polylines from main array (in reverse order to maintain indices)
      const sortedIndices = selectedIndices.sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        state.perimPolylines.splice(idx, 1);
      }
      
      // Add the joined result(s)
      state.perimPolylines.push(...workingPolys);
      
      clearSelection();
      updateClosedParts(); // Check for newly closed parts (blue)
      renderer.setData(state.perimPolylines);
      setPolyCount();
      enableActions();
      setStatus(`Manually joined ${selectedIndices.length} selected lines into ${workingPolys.length} polyline(s).`);
      console.log("[MANUAL-JOIN] Created", workingPolys.length, "polylines from", selectedIndices.length, "selected lines");
    } else {
      setStatus(`Manual join failed: Could not connect selected lines within tolerance ${tol.toFixed(3)}.`);
      console.log("[MANUAL-JOIN] No connections found within tolerance", tol);
    }
  });

  // Auto-join button
  els.btnAutoJoin?.addEventListener('click', () => {
    saveState("Auto-Join All");
    autoJoinAll();
  });

  // Unjoin button
  els.btnUnjoin?.addEventListener('click', () => {
    saveState("Unjoin Selected");
    unjoinSelected();
  });

  // Delete button
  els.btnDelete?.addEventListener('click', () => {
    saveState("Delete Selected");
    deleteSelected();
  });

  // Show dimensions checkbox
  els.showDimensions?.addEventListener('change', (e) => {
    const showDims = e.target.checked;
    renderer.showDimensions = showDims;
    renderer.render();
    console.log("[DIMENSIONS] Show dimension lines:", showDims);
  });
}

// Keyboard shortcuts
function wireKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Z - Undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      undo();
      e.preventDefault();
      return;
    }
    
    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
      redo();
      e.preventDefault();
      return;
    }
    
    // R key - rotate selected closed parts (blue parts only)
    if (e.key === 'r' || e.key === 'R') {
      const selectedClosedParts = [];
      for (const idx of state.selectedPolylines) {
        if (state.closedParts.has(idx)) {
          selectedClosedParts.push(idx);
        }
      }
      
      if (selectedClosedParts.length > 0) {
        saveState("Rotate Parts");
        let rotatedCount = 0;
        for (const partIndex of selectedClosedParts) {
          if (rotatePart(partIndex, 90)) {
            rotatedCount++;
          }
        }
        
        if (rotatedCount > 0) {
          updateClosedParts(); // Update closed parts after rotation
          renderer.setData(state.perimPolylines);
          updateDimensions();
          enableActions();
          setStatus(`Rotated ${rotatedCount} closed part(s) by 90 degrees.`);
          console.log("[ROTATION] Rotated", rotatedCount, "closed parts by 90 degrees");
        }
      } else if (state.selectedPolylines.size > 0) {
        setStatus("Rotation only works on blue closed parts. Select closed parts first.");
      } else {
        setStatus("Select blue closed parts to rotate them with R key.");
      }
      e.preventDefault();
    }
    
    // Delete key - delete selected polylines
    if (e.key === 'Delete' && state.selectedPolylines.size > 0) {
      saveState("Delete Selection");
      deleteSelected();
      e.preventDefault();
    }
    
    // Escape key - clear selection
    if (e.key === 'Escape') {
      clearSelection();
      e.preventDefault();
    }
    
    console.log("[KEYBOARD] Key pressed:", e.key, "Ctrl:", e.ctrlKey, "Shift:", e.shiftKey, "Selected:", state.selectedPolylines.size);
  });
}

function wireClearAll() {
  els.btnClearAll?.addEventListener('click', () => {
    state.allPolylines = [];
    state.perimPolylines = [];
    clearSelection();
    
    els.partCount.textContent = "0";
    els.btnClearAll.disabled = true;
    setPolyCount();
    
    renderer.setData([]);
    renderer.render();
    enableActions();
    setStatus("All parts cleared.");
    
    console.log("[CLEAR-ALL] Workspace cleared");
  });
}

function wireDebug() {
  const btnDebug = document.getElementById('btnDebug');
  const btnClearLogs = document.getElementById('btnClearLogs');
  
  btnDebug?.addEventListener('click', showDebugModal);
  btnClearLogs?.addEventListener('click', () => {
    debugLogs.length = 0;
    setStatus("Debug logs cleared.");
  });
}

function init() {
  wireFileInput();
  wireDragDrop();
  wireView();
  wireUnits();
  wireClose();
  wireExport();
  wireSelection();
  wireKeyboard();
  wireClearAll();
  wireDebug();

  setUnitsLabel();
  setPolyCount();
  enableActions();
  updateSelectionUI();

  // Initial canvas sizing/render
  renderer.render();
}
init();
