/**
 * src/viewer/canvasRenderer.js
 * Canvas renderer with:
 * - Pan (drag) / Zoom (wheel)
 * - Optional grid
 * - Fit-to-view
 * - Renders polylines (linearized preview; bulge preserved for export elsewhere)
 *
 * API:
 * const r = createCanvasRenderer(canvas, { grid: false, onTransform: () => {} });
 * r.setData(polylines); // [{ layer, closed, vertices:[{x,y,bulge?}, ...] }]
 * r.setGrid(true|false);
 * r.fitToView(paddingPx?);
 * r.render();
 *
 * Notes:
 * - World coordinates use DXF "model space" (Y up). Canvas uses Y down; we flip Y in transform.
 * - Grid step auto-selects to ~80px in screen space (nice spacing regardless of zoom).
 */

export function createCanvasRenderer(canvas, opts = {}) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext("2d");
  
  // Extract new options
  const {
    selectedIndices = new Set(),
    closedParts = new Set(), // Indices of closed parts (render blue)
    onPolylineClick = () => {},
    onPartDragStart = () => {},
    onPartDrag = () => {},
    onPartDragEnd = () => {},
  } = opts;

  const state = {
    polylines: [],
    grid: !!opts.grid,
    // World->Screen (CSS px): sx = tx + x*scale; sy = ty - y*scale (flip Y)
    scale: 1,
    tx: 0,
    ty: 0,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    transformStart: { tx: 0, ty: 0 },
    isDraggingSelection: false,
    selectionStart: { x: 0, y: 0 },
    selectionEnd: { x: 0, y: 0 },
    isWindowSelection: true, // true = left-to-right (window), false = right-to-left (crossing)
  };

  // ---------- Sizing / HiDPI ----------
  function resizeToDisplaySize() {
    const cw = Math.max(1, canvas.clientWidth || 1);
    const ch = Math.max(1, canvas.clientHeight || 1);
    const needW = Math.floor(cw * dpr);
    const needH = Math.floor(ch * dpr);
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    // Draw in CSS pixel coordinates
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- Transform helpers ----------
  function worldToScreen(p) {
    return {
      x: state.tx + p.x * state.scale,
      y: state.ty - p.y * state.scale,
    };
  }
  function screenToWorld(p) {
    return {
      x: (p.x - state.tx) / state.scale,
      y: (state.ty - p.y) / state.scale,
    };
  }

  // ---------- Grid helpers ----------
  function niceStep(target) {
    // Return a "nice" step close to target: 1, 2, 5 * 10^k
    if (target <= 0) return 1;
    const log = Math.log10(target);
    const pow = Math.floor(log);
    const frac = target / Math.pow(10, pow);
    let nice;
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
    return nice * Math.pow(10, pow);
  }

  function drawGrid() {
    if (!state.grid) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    
    // Find nice grid spacing (aim for ~80px in screen space)
    const targetWorldStep = 80 / state.scale;
    const worldStep = niceStep(targetWorldStep);
    const screenStep = worldStep * state.scale;
    
    if (screenStep < 5) return; // too dense
    
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    
    // Vertical lines
    const worldLeft = screenToWorld({ x: 0, y: 0 }).x;
    const worldRight = screenToWorld({ x: cw, y: 0 }).x;
    const startX = Math.floor(worldLeft / worldStep) * worldStep;
    for (let wx = startX; wx <= worldRight + worldStep; wx += worldStep) {
      const sx = worldToScreen({ x: wx, y: 0 }).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, ch);
      ctx.stroke();
    }
    
    // Horizontal lines
    const worldTop = screenToWorld({ x: 0, y: 0 }).y;
    const worldBottom = screenToWorld({ x: 0, y: ch }).y;
    const startY = Math.floor(worldBottom / worldStep) * worldStep;
    for (let wy = startY; wy <= worldTop + worldStep; wy += worldStep) {
      const sy = worldToScreen({ x: 0, y: wy }).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(cw, sy);
      ctx.stroke();
    }
  }

  // ---------- Polyline drawing ----------
  function drawPolyline(poly, index) {
    if (!poly?.vertices?.length) return;
    
    // Check if this polyline is selected or a closed part
    const isSelected = selectedIndices && selectedIndices.has(index);
    const isClosedPart = closedParts && closedParts.has(index);
    
    // Color priority: Orange (selected) > Blue (closed part) > Green (normal)
    let strokeColor = "#22c55e"; // green (normal lines)
    if (isClosedPart) strokeColor = "#3b82f6"; // blue (closed parts) 
    if (isSelected) strokeColor = "#f59e0b"; // orange (selected - highest priority)
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 3 : (isClosedPart ? 2.5 : 2); // thicker if selected or closed part
    ctx.setLineDash([]);
    
    ctx.beginPath();
    let first = true;
    
    for (let i = 0; i < poly.vertices.length; i++) {
      const v = poly.vertices[i];
      const sp = worldToScreen(v);
      
      if (first) {
        ctx.moveTo(sp.x, sp.y);
        first = false;
      } else {
        // For simplicity, we just draw straight lines
        // In a full implementation, we'd handle bulge arcs
        ctx.lineTo(sp.x, sp.y);
      }
    }
    
    // Close if marked as closed
    if (poly.closed && poly.vertices.length > 2) {
      ctx.closePath();
    }
    
    ctx.stroke();
    
    // Draw vertices as small circles
    ctx.fillStyle = isSelected ? "#f59e0b" : "#f59e0b"; // amber
    for (const v of poly.vertices) {
      const sp = worldToScreen(v);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, isSelected ? 4 : 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  // ---------- Hit testing ----------
  function hitTestPolylines(screenPos) {
    const worldPos = screenToWorld(screenPos);
    const tolerance = 10 / state.scale; // 10 pixels in world space
    
    for (let i = 0; i < state.polylines.length; i++) {
      const poly = state.polylines[i];
      if (!poly?.vertices?.length) continue;
      
      // Test each line segment in the polyline
      for (let j = 0; j < poly.vertices.length - 1; j++) {
        const v1 = poly.vertices[j];
        const v2 = poly.vertices[j + 1];
        
        const dist = distanceToLineSegment(worldPos, v1, v2);
        if (dist <= tolerance) {
          return i; // Return polyline index
        }
      }
      
      // If closed, also check the closing segment
      if (poly.closed && poly.vertices.length > 2) {
        const vFirst = poly.vertices[0];
        const vLast = poly.vertices[poly.vertices.length - 1];
        const dist = distanceToLineSegment(worldPos, vLast, vFirst);
        if (dist <= tolerance) {
          return i;
        }
      }
    }
    return -1; // No hit
  }
  
  function distanceToLineSegment(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lengthSq = dx * dx + dy * dy;
    
    if (lengthSq === 0) {
      // Point to point distance
      const pdx = point.x - lineStart.x;
      const pdy = point.y - lineStart.y;
      return Math.sqrt(pdx * pdx + pdy * pdy);
    }
    
    // Project point onto line
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    
    const pdx = point.x - projX;
    const pdy = point.y - projY;
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  // ---------- Drag Selection ----------
  function performDragSelection() {
    // Convert screen selection box to world coordinates
    const worldStart = screenToWorld(state.selectionStart);
    const worldEnd = screenToWorld(state.selectionEnd);
    
    const minX = Math.min(worldStart.x, worldEnd.x);
    const maxX = Math.max(worldStart.x, worldEnd.x);
    const minY = Math.min(worldStart.y, worldEnd.y);
    const maxY = Math.max(worldStart.y, worldEnd.y);
    
    console.log("[DRAG-SELECT]", state.isWindowSelection ? "Window" : "Crossing", "selection:", 
      minX.toFixed(2), minY.toFixed(2), "to", maxX.toFixed(2), maxY.toFixed(2));
    
    const selectedIndices = [];
    
    for (let i = 0; i < state.polylines.length; i++) {
      const poly = state.polylines[i];
      if (!poly?.vertices?.length) continue;
      
      let isSelected = false;
      
      if (state.isWindowSelection) {
        // Window selection: ALL vertices must be inside the box
        isSelected = poly.vertices.every(v => 
          v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY
        );
      } else {
        // Crossing selection: ANY part of the polyline intersects the box
        isSelected = poly.vertices.some(v => 
          v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY
        ) || polylineIntersectsBox(poly, minX, minY, maxX, maxY);
      }
      
      if (isSelected) {
        selectedIndices.push(i);
      }
    }
    
    console.log("[DRAG-SELECT] Selected", selectedIndices.length, "polylines:", selectedIndices);
    return selectedIndices;
  }
  
  function polylineIntersectsBox(poly, minX, minY, maxX, maxY) {
    // Check if any line segment intersects the selection box
    for (let i = 0; i < poly.vertices.length - 1; i++) {
      const v1 = poly.vertices[i];
      const v2 = poly.vertices[i + 1];
      
      if (lineIntersectsBox(v1.x, v1.y, v2.x, v2.y, minX, minY, maxX, maxY)) {
        return true;
      }
    }
    
    // Check closing segment for closed polylines
    if (poly.closed && poly.vertices.length > 2) {
      const vFirst = poly.vertices[0];
      const vLast = poly.vertices[poly.vertices.length - 1];
      if (lineIntersectsBox(vLast.x, vLast.y, vFirst.x, vFirst.y, minX, minY, maxX, maxY)) {
        return true;
      }
    }
    
    return false;
  }
  
  function lineIntersectsBox(x1, y1, x2, y2, boxMinX, boxMinY, boxMaxX, boxMaxY) {
    // Simple line-box intersection test
    const lineMinX = Math.min(x1, x2);
    const lineMaxX = Math.max(x1, x2);
    const lineMinY = Math.min(y1, y2);
    const lineMaxY = Math.max(y1, y2);
    
    // Check if line bounding box overlaps with selection box
    return !(lineMaxX < boxMinX || lineMinX > boxMaxX || lineMaxY < boxMinY || lineMinY > boxMaxY);
  }
  
  function drawSelectionBox() {
    if (!state.isDraggingSelection) return;
    
    const x1 = state.selectionStart.x;
    const y1 = state.selectionStart.y;
    const x2 = state.selectionEnd.x;
    const y2 = state.selectionEnd.y;
    
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    
    // Different colors and styles for window vs crossing selection
    if (state.isWindowSelection) {
      // Window selection: blue solid box
      ctx.strokeStyle = "#3b82f6";
      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.setLineDash([]);
    } else {
      // Crossing selection: green dashed box
      ctx.strokeStyle = "#22c55e";
      ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
      ctx.setLineDash([5, 5]);
    }
    
    ctx.lineWidth = 1;
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]); // Reset dash
  }

  // ---------- Event handlers ----------
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onMouseDown(e) {
    if (e.button !== 0) return; // left button only
    const pos = getMousePos(e);
    
    // Check if clicking on a polyline
    const clickedIndex = hitTestPolylines(pos);
    if (clickedIndex !== -1) {
      const isClosedPart = closedParts && closedParts.has(clickedIndex);
      
      if (isClosedPart) {
        // Start part dragging for blue closed parts
        const worldPos = screenToWorld(pos);
        onPartDragStart(clickedIndex, worldPos.x, worldPos.y);
        state.isDraggingPart = true;
        canvas.style.cursor = "move";
        e.preventDefault();
        return;
      } else if (onPolylineClick) {
        // Regular selection for non-closed parts
        onPolylineClick(clickedIndex, e.shiftKey);
        return;
      }
    }
    
    // Start drag selection (empty area clicked)
    state.isDraggingSelection = true;
    state.selectionStart = pos;
    state.selectionEnd = pos;
    canvas.style.cursor = "crosshair";
    e.preventDefault();
  }

  function onMouseMove(e) {
    const pos = getMousePos(e);
    
    if (state.isDraggingPart) {
      // Part dragging mode
      const worldPos = screenToWorld(pos);
      onPartDrag(worldPos.x, worldPos.y);
      return;
    }
    
    if (state.isDraggingSelection) {
      // Drag selection mode
      state.selectionEnd = pos;
      
      // Determine selection type: left-to-right = window, right-to-left = crossing
      state.isWindowSelection = state.selectionEnd.x >= state.selectionStart.x;
      
      render(); // Redraw with selection box
      return;
    }
    
    if (state.isPanning) {
      // Canvas panning mode
      const dx = pos.x - state.panStart.x;
      const dy = pos.y - state.panStart.y;
      state.tx = state.transformStart.tx + dx;
      state.ty = state.transformStart.ty + dy;
      render();
      if (opts.onTransform) opts.onTransform();
    }
  }

  function onMouseUp(e) {
    if (state.isDraggingPart) {
      state.isDraggingPart = false;
      onPartDragEnd();
      canvas.style.cursor = "grab";
    } else if (state.isDraggingSelection) {
      // Complete drag selection
      const selectedIndices = performDragSelection();
      if (opts.onSelectionDrag) {
        opts.onSelectionDrag(selectedIndices, e.shiftKey);
      }
      
      state.isDraggingSelection = false;
      canvas.style.cursor = "grab";
      render(); // Clear selection box
    } else if (state.isPanning) {
      state.isPanning = false;
      canvas.style.cursor = "grab";
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const pos = getMousePos(e);
    const worldPt = screenToWorld(pos);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.scale *= factor;
    state.scale = Math.max(0.001, Math.min(1000, state.scale));
    
    // Keep world point under cursor
    const newScreenPt = worldToScreen(worldPt);
    state.tx += pos.x - newScreenPt.x;
    state.ty += pos.y - newScreenPt.y;
    
    render();
    if (opts.onTransform) opts.onTransform();
  }

  // ---------- Public API ----------
  function render() {
    resizeToDisplaySize();
    
    // Clear
    ctx.fillStyle = "#0a0f21";
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    
    // Draw grid
    drawGrid();
    
    // Draw polylines
    for (let i = 0; i < state.polylines.length; i++) {
      drawPolyline(state.polylines[i], i);
    }
    
    // Draw selection box on top
    drawSelectionBox();
  }

  function setData(polylines) {
    state.polylines = polylines || [];
    render();
  }

  function setGrid(enabled) {
    state.grid = !!enabled;
    render();
  }

  function fitToView(paddingPx = 50) {
    if (!state.polylines.length) {
      // Reset to default view
      state.scale = 1;
      state.tx = canvas.clientWidth / 2;
      state.ty = canvas.clientHeight / 2;
      render();
      return;
    }
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of state.polylines) {
      for (const v of poly.vertices || []) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
    
    if (!isFinite(minX)) return;
    
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 && worldH <= 0) return;
    
    const canvasW = canvas.clientWidth - 2 * paddingPx;
    const canvasH = canvas.clientHeight - 2 * paddingPx;
    const scaleX = canvasW / Math.max(worldW, 1e-6);
    const scaleY = canvasH / Math.max(worldH, 1e-6);
    state.scale = Math.min(scaleX, scaleY);
    
    // Center
    const worldCx = (minX + maxX) / 2;
    const worldCy = (minY + maxY) / 2;
    state.tx = canvas.clientWidth / 2 - worldCx * state.scale;
    state.ty = canvas.clientHeight / 2 + worldCy * state.scale;
    
    render();
    if (opts.onTransform) opts.onTransform();
  }

  // Wire up events
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("wheel", onWheel);
  canvas.style.cursor = "grab";

  // Initial render
  render();

  return {
    setData,
    setGrid,
    fitToView,
    render,
  };
}
