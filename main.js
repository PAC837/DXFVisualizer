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
  btnFit: document.getElementById("btnFit"),
  gridToggle: document.getElementById("gridToggle"),
  unitsSelect: document.getElementById("unitsSelect"),
  btnJoin: document.getElementById("btnJoin"),
  btnAutoJoin: document.getElementById("btnAutoJoin"),
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
};

const renderer = createCanvasRenderer(els.canvas, {
  grid: false,
  onTransform: () => {},
  selectedIndices: state.selectedPolylines,
  onPolylineClick: (polylineIndex, shiftKey) => {
    handlePolylineClick(polylineIndex, shiftKey);
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await file.text();
    await handleTextLoad(text, file.name);
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
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    const text = await file.text();
    await handleTextLoad(text, file.name);
  });
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

function updateSelectionUI() {
  const count = state.selectedPolylines.size;
  els.selectedCount.textContent = String(count);
  
  // Enable/disable selection-related buttons
  els.btnClearSelection.disabled = count === 0;
  els.btnJoin.disabled = count < 2; // Need at least 2 to join
  
  if (count === 0) {
    setStatus("No lines selected. Click to select, Shift+Click for multi-select.");
  } else if (count === 1) {
    setStatus(`1 line selected. Shift+Click more lines to join them.`);
  } else {
    setStatus(`${count} lines selected. Click Join to connect them.`);
  }
}

function clearSelection() {
  state.selectedPolylines.clear();
  updateSelectionUI();
  enableActions(); // Update button states
  renderer.render();
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
    const selectedPolys = selectedIndices.map(i => state.perimPolylines[i]);
    
    const tol = parseFloat(els.tolInput?.value || "0.001") || 0.001;
    const result = attemptClosePerimeter(selectedPolys, tol);
    
    if (!result || !result.closed) {
      setStatus("Join failed: Could not connect selected lines into a closed path with current tolerance.");
      return;
    }
    
    // Replace selected polylines with the joined result
    const newPoly = { vertices: result.vertices, closed: true, layer: "JOINED" };
    
    // Remove selected polylines (in reverse order to maintain indices)
    const sortedIndices = selectedIndices.sort((a, b) => b - a);
    for (const idx of sortedIndices) {
      state.perimPolylines.splice(idx, 1);
    }
    
    // Add the new joined polyline
    state.perimPolylines.push(newPoly);
    
    // Clear selection and update
    clearSelection();
    renderer.setData(state.perimPolylines);
    setPolyCount();
    enableActions(); // Update export button state
    
    if (result.closed) {
      setStatus(`Joined ${selectedIndices.length} lines into a closed perimeter! Export button is now enabled.`);
    } else {
      setStatus(`Joined ${selectedIndices.length} lines into a single polyline.`);
    }
  });

  // Auto-join button
  els.btnAutoJoin?.addEventListener('click', () => {
    autoJoinAll();
  });

  // Delete button
  els.btnDelete?.addEventListener('click', () => {
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
    // Delete key - delete selected polylines
    if (e.key === 'Delete' && state.selectedPolylines.size > 0) {
      deleteSelected();
      e.preventDefault();
    }
    
    // Escape key - clear selection
    if (e.key === 'Escape') {
      clearSelection();
      e.preventDefault();
    }
    
    console.log("[KEYBOARD] Key pressed:", e.key, "Selected:", state.selectedPolylines.size);
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
  wireDebug();

  setUnitsLabel();
  setPolyCount();
  enableActions();
  updateSelectionUI();

  // Initial canvas sizing/render
  renderer.render();
}
init();
