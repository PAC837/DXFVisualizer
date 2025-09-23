/**
 * src/geom/join.js
 * Utilities to join/close polylines within a tolerance.
 *
 * Main function: attemptClosePerimeter(polylines, tolerance)
 * - Takes multiple polylines and tries to join them into a single closed path
 * - Uses endpoint-to-endpoint distance matching within tolerance
 * - Returns { closed: boolean, vertices: Array<{x,y,bulge?}> } or null
 *
 * Strategy:
 * 1. If single polyline, ensure it's closed by snapping endpoints if within tolerance
 * 2. If multiple polylines, attempt to chain them by matching endpoints within tolerance
 * 3. Preserve bulge values during joining
 */

import { isClosed } from "./closedness.js";

/**
 * Calculate Euclidean distance between two 2D points.
 */
function dist(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return Math.hypot(dx, dy);
}

/**
 * Attempt to close/join PERIMETER polylines into a single closed path.
 * @param {Array<{layer:string, closed:boolean, vertices:Array<{x,y,bulge?}>}>} polylines
 * @param {number} tolerance - joining tolerance in model units
 * @returns {{ closed: boolean, vertices: Array<{x,y,bulge?}> } | null}
 */
export function attemptClosePerimeter(polylines, tolerance = 0.001) {
  if (!Array.isArray(polylines) || polylines.length === 0) return null;
  
  const tol = Math.max(tolerance || 0.001, 1e-9);
  
  // Single polyline case: just ensure closure
  if (polylines.length === 1) {
    const poly = polylines[0];
    const vertices = poly?.vertices || [];
    if (vertices.length < 3) return null;
    
    if (poly.closed || isClosed(vertices, tol)) {
      // Already closed, ensure last point exactly matches first
      const result = [...vertices];
      if (result.length >= 3) {
        const first = result[0];
        const last = result[result.length - 1];
        if (dist(first, last) <= tol) {
          // Snap last to first
          result[result.length - 1] = { ...first };
        } else if (!poly.closed) {
          // Append first to close
          result.push({ ...first });
        }
      }
      return { closed: true, vertices: result };
    } else {
      // Try to close by connecting endpoints
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (dist(first, last) <= tol) {
        const result = [...vertices];
        result[result.length - 1] = { ...first }; // snap last to first
        return { closed: true, vertices: result };
      } else {
        // Can't close within tolerance
        return null;
      }
    }
  }
  
  // Multiple polylines: attempt to chain them
  return chainPolylines(polylines, tol);
}

/**
 * Attempt to chain multiple polylines into a single closed path.
 * Simple approach: preserve ALL vertices, just connect endpoints within tolerance.
 * No position changes, just link the lines together.
 */
function chainPolylines(polylines, tol) {
  if (polylines.length === 0) return null;
  
  // Create working copies
  const unused = polylines.map((poly, idx) => ({
    id: idx,
    vertices: [...(poly?.vertices || [])],
  })).filter(c => c.vertices.length >= 2);
  
  if (unused.length === 0) return null;
  
  // Start with the first polyline
  let result = [...unused[0].vertices];
  unused.splice(0, 1); // Remove from unused
  
  console.log("[JOIN] Starting with vertices:", result.map(v => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)})`));
  
  // Keep connecting until no more connections possible
  while (unused.length > 0) {
    const resultStart = result[0];
    const resultEnd = result[result.length - 1];
    
    let bestMatch = -1;
    let bestAction = null;
    let bestDist = Infinity;
    
    // Find the best connection
    for (let i = 0; i < unused.length; i++) {
      const chain = unused[i];
      const chainStart = chain.vertices[0];
      const chainEnd = chain.vertices[chain.vertices.length - 1];
      
      // Option 1: Connect chain start to result end
      const d1 = dist(resultEnd, chainStart);
      if (d1 <= tol && d1 < bestDist) {
        bestMatch = i;
        bestDist = d1;
        bestAction = 'appendForward';
      }
      
      // Option 2: Connect chain end to result end  
      const d2 = dist(resultEnd, chainEnd);
      if (d2 <= tol && d2 < bestDist) {
        bestMatch = i;
        bestDist = d2;
        bestAction = 'appendReverse';
      }
      
      // Option 3: Connect chain start to result start
      const d3 = dist(resultStart, chainStart);
      if (d3 <= tol && d3 < bestDist) {
        bestMatch = i;
        bestDist = d3;
        bestAction = 'prependReverse';
      }
      
      // Option 4: Connect chain end to result start
      const d4 = dist(resultStart, chainEnd);
      if (d4 <= tol && d4 < bestDist) {
        bestMatch = i;
        bestDist = d4;
        bestAction = 'prependForward';
      }
    }
    
    if (bestMatch === -1) {
      console.log("[JOIN] No more connections possible, stopping with", result.length, "vertices");
      break; // No more connections
    }
    
    const chainToAdd = unused[bestMatch];
    let verticesToAdd = [...chainToAdd.vertices];
    
    console.log("[JOIN] Connecting chain with", chainToAdd.vertices.length, "vertices, action:", bestAction);
    
    // Execute the best action
    switch (bestAction) {
      case 'appendForward':
        // Add chain to end: result[...] + chain[1...] (skip first to avoid duplication)
        result = [...result, ...verticesToAdd.slice(1)];
        break;
        
      case 'appendReverse':
        // Add reversed chain to end: result[...] + chain[...-1] reversed (skip last to avoid duplication)
        verticesToAdd.reverse();
        result = [...result, ...verticesToAdd.slice(1)];
        break;
        
      case 'prependForward':
        // Add chain to start: chain[...-1] + result[...] (skip last to avoid duplication)  
        result = [...verticesToAdd.slice(0, -1), ...result];
        break;
        
      case 'prependReverse':
        // Add reversed chain to start: chain[1...] reversed + result[...] (skip first after reverse)
        verticesToAdd.reverse();
        result = [...verticesToAdd.slice(0, -1), ...result];
        break;
    }
    
    // Remove the used chain
    unused.splice(bestMatch, 1);
    console.log("[JOIN] After connection, result has", result.length, "vertices");
  }
  
  // Check if path is closed
  if (result.length >= 3) {
    const first = result[0];
    const last = result[result.length - 1];
    const closeDist = dist(first, last);
    console.log("[JOIN] Distance between first and last:", closeDist.toFixed(6), "tolerance:", tol);
    
    if (closeDist <= tol) {
      // Close the path by making last point exactly equal to first
      result[result.length - 1] = { ...first };
      console.log("[JOIN] Path closed successfully with", result.length, "vertices");
      return { closed: true, vertices: result };
    } else {
      console.log("[JOIN] Path not closed - endpoints too far apart");
    }
  }
  
  return null; // Not closed within tolerance
}
