/**
 * src/geom/closedness.js
 * Utilities to determine whether a polyline is closed within a tolerance.
 *
 * A polyline is considered closed if:
 * - It has at least 3 vertices, and
 * - The distance between the first and last vertex is <= tol
 *
 * Note:
 * - We ignore bulge here; closedness is purely endpoint proximity.
 * - Tolerance is in model units (DXF space), typically inches or mm based on $INSUNITS.
 */

/**
 * Euclidean distance between two 2D points.
 * @param {{x:number, y:number}} a
 * @param {{x:number, y:number}} b
 * @returns {number}
 */
function dist(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return Math.hypot(dx, dy);
}

/**
 * Determine if a polyline vertices array is closed within a given tolerance.
 * @param {Array<{x:number,y:number,bulge?:number}>} vertices
 * @param {number} tol - closure tolerance (default 1e-6)
 * @returns {boolean}
 */
export function isClosed(vertices, tol = 1e-6) {
  if (!Array.isArray(vertices)) return false;
  if (vertices.length < 3) return false;
  const first = vertices[0];
  const last = vertices[vertices.length - 1];
  return dist(first, last) <= (typeof tol === "number" ? tol : 1e-6);
}

/**
 * Ensure last equals first when they are within tolerance; otherwise leave as-is.
 * This is a non-destructive helper for viewers/exports that require explicit closure.
 * @param {Array<{x:number,y:number,bulge?:number}>} vertices
 * @param {number} tol
 * @returns {Array<{x:number,y:number,bulge?:number}>} possibly extended/adjusted copy
 */
export function ensureClosedCopy(vertices, tol = 1e-6) {
  if (!Array.isArray(vertices) || vertices.length === 0) return [];
  const out = vertices.map(v => ({ ...v }));
  if (out.length >= 2) {
    const first = out[0];
    const last = out[out.length - 1];
    if (dist(first, last) <= tol) {
      // snap last exactly to first for cleanliness
      out[out.length - 1] = { ...first };
    } else {
      // append first to close
      out.push({ ...first });
    }
  }
  return out;
}
