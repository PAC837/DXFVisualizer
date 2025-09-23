/**
 * src/parse/dxfParser.js
 * Lightweight ASCII DXF parser (subset) focused on:
 * - HEADER:$INSUNITS detection (maps to "in"/"mm" when possible)
 * - ENTITIES:LWPOLYLINE (with bulge), POLYLINE/SEQEND + VERTEX
 * Output:
 * {
 *   unitsAuto: "in" | "mm" | null,
 *   polylines: Array<{
 *     layer: string,
 *     closed: boolean,
 *     vertices: Array<{ x:number, y:number, bulge?:number }>
 *   }>
 * }
 *
 * Notes:
 * - We tolerate minimal format variance. Binary DXF is not supported.
 * - We do not interpret ARC/CIRCLE/etc. Only polylines are extracted.
 * - For preview, arcs may be linearized; bulge is preserved for export.
 * - We DO NOT rescale coordinates; units are metadata only.
 */

export function parseDXF(text) {
  const lines = toPairs(text);
  console.log("[DXF-PARSER] Total pairs created:", lines.length);
  console.log("[DXF-PARSER] First 10 pairs:", lines.slice(0, 10));
  
  const res = {
    unitsAuto: null,
    polylines: [],
  };

  // Parse HEADER for $INSUNITS
  const headerRange = findSection(lines, "HEADER");
  console.log("[DXF-PARSER] HEADER section range:", headerRange);
  if (headerRange) {
    res.unitsAuto = parseUnitsFromHeader(lines, headerRange[0], headerRange[1]);
  }

  // Parse ENTITIES for LWPOLYLINE and POLYLINE/ VERTEX sequences
  const entitiesRange = findSection(lines, "ENTITIES");
  console.log("[DXF-PARSER] ENTITIES section range:", entitiesRange);
  if (entitiesRange) {
    const polys = parseEntitiesForPolylines(lines, entitiesRange[0], entitiesRange[1]);
    // Deduplicate trivial/empty
    res.polylines = polys.filter((p) => (p?.vertices?.length || 0) >= 2);
  } else {
    console.log("[DXF-PARSER] No ENTITIES section found! Searching for sections...");
    const allSections = [];
    for (let i = 0; i < lines.length; i++) {
      const [code, val] = lines[i];
      if (code === "0" && val.toUpperCase() === "SECTION") {
        if (i + 1 < lines.length && lines[i + 1][0] === "2") {
          const secName = lines[i + 1][1];
          allSections.push(secName);
        }
      }
    }
    console.log("[DXF-PARSER] All sections found:", allSections);
  }

  return res;
}

/**
 * Convert DXF text to an array of [code, value] pairs (both strings).
 * DXF uses alternating lines: group code, then value.
 */
function toPairs(text) {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = raw[i] != null ? raw[i].trim() : "";
    const value = raw[i + 1] != null ? raw[i + 1].trim() : "";
    pairs.push([code, value]);
  }
  return pairs;
}

/**
 * Find a section by name. Returns [startIndex, endIndexExclusive] in pairs array.
 */
function findSection(pairs, nameUpper) {
  nameUpper = String(nameUpper || "").toUpperCase();
  let start = -1;
  for (let i = 0; i < pairs.length; i++) {
    const [code, val] = pairs[i];
    if (code === "0" && val.toUpperCase() === "SECTION") {
      // Next non-comment "2" should be the section name
      if (i + 1 < pairs.length && pairs[i + 1][0] === "2") {
        const secName = (pairs[i + 1][1] || "").toUpperCase();
        if (secName === nameUpper) {
          start = i + 2;
          break;
        }
      }
    }
  }
  if (start === -1) return null;

  for (let j = start; j < pairs.length; j++) {
    const [code, val] = pairs[j];
    if (code === "0" && val.toUpperCase() === "ENDSEC") {
      return [start, j];
    }
  }
  return [start, pairs.length];
}

/**
 * Parse $INSUNITS inside HEADER.
 * We look for 9:$INSUNITS then the next 70: <int>
 */
function parseUnitsFromHeader(pairs, start, end) {
  let want = false;
  let codeVal = null;
  for (let i = start; i < end; i++) {
    const [code, val] = pairs[i];
    if (code === "9" && val === "$INSUNITS") {
      want = true;
      codeVal = null;
      continue;
    }
    if (want && code === "70") {
      codeVal = parseIntSafe(val);
      const mapped = mapInsunits(codeVal);
      return mapped;
    }
  }
  return null;
}

// Map a subset of AutoCAD $INSUNITS codes to "in"/"mm"
function mapInsunits(n) {
  // Common codes:
  // 0 = Unitless, 1 = Inches, 2 = Feet, 3 = Miles, 4 = Millimeters,
  // 5 = Centimeters, 6 = Meters, 7 = Kilometers, 8 = Microinches, 9 = Mils, ...
  if (n === 1) return "in";
  if (n === 4) return "mm";
  return null;
}

/**
 * Parse ENTITIES section, extracting LWPOLYLINE, POLYLINE+VERTEX, and converting LINE/ARC to polylines.
 */
function parseEntitiesForPolylines(pairs, start, end) {
  const out = [];
  const entityTypes = {};
  
  console.log("[DXF-PARSER] Scanning ENTITIES section from", start, "to", end, "total pairs:", pairs.length);
  
  for (let i = start; i < end; i++) {
    const [code, val] = pairs[i];
    if (code !== "0") continue;

    const type = (val || "").toUpperCase();
    entityTypes[type] = (entityTypes[type] || 0) + 1;
    
    if (type === "LWPOLYLINE") {
      console.log("[DXF-PARSER] Found LWPOLYLINE at index", i);
      const { next, poly } = readLwPolyline(pairs, i + 1, end);
      i = next - 1;
      if (poly) {
        console.log("[DXF-PARSER] Successfully parsed LWPOLYLINE:", poly);
        out.push(poly);
      } else {
        console.log("[DXF-PARSER] Failed to parse LWPOLYLINE");
      }
    } else if (type === "POLYLINE") {
      console.log("[DXF-PARSER] Found POLYLINE at index", i);
      const { next, poly } = readPolylineSeq(pairs, i + 1, end);
      i = next - 1;
      if (poly) {
        console.log("[DXF-PARSER] Successfully parsed POLYLINE:", poly);
        out.push(poly);
      } else {
        console.log("[DXF-PARSER] Failed to parse POLYLINE");
      }
    } else if (type === "LINE") {
      console.log("[DXF-PARSER] Found LINE at index", i);
      const { next, poly } = readLine(pairs, i + 1, end);
      i = next - 1;
      if (poly) {
        console.log("[DXF-PARSER] Successfully parsed LINE:", poly);
        out.push(poly);
      }
    } else if (type === "ARC") {
      console.log("[DXF-PARSER] Found ARC at index", i);
      const { next, poly } = readArc(pairs, i + 1, end);
      i = next - 1;
      if (poly) {
        console.log("[DXF-PARSER] Successfully parsed ARC:", poly);
        out.push(poly);
      }
    }
  }
  
  console.log("[DXF-PARSER] Entity types found in DXF:", JSON.stringify(entityTypes, null, 2));
  console.log("[DXF-PARSER] Total polylines extracted:", out.length);
  
  return out;
}

function readLwPolyline(pairs, i, end) {
  const poly = {
    layer: "",
    closed: false,
    vertices: [],
  };

  let current = null;
  let doneAt = i;
  for (let j = i; j < end; j++) {
    doneAt = j;
    const [code, val] = pairs[j];

    if (code === "0") {
      // Entity ended
      break;
    }

    switch (code) {
      case "8": // layer
        poly.layer = val || "";
        break;
      case "70": {
        const flags = parseIntSafe(val) || 0;
        // bit 1 (1) closed polyline
        poly.closed = (flags & 1) === 1;
        break;
      }
      case "10": {
        // start new vertex
        const x = parseFloatSafe(val);
        current = { x, y: 0 };
        poly.vertices.push(current);
        break;
      }
      case "20": {
        if (!current) {
          current = { x: 0, y: parseFloatSafe(val) };
          poly.vertices.push(current);
        } else {
          current.y = parseFloatSafe(val);
        }
        break;
      }
      case "42": {
        if (!current) {
          current = { x: 0, y: 0, bulge: parseFloatSafe(val) };
          poly.vertices.push(current);
        } else {
          current.bulge = parseFloatSafe(val);
        }
        break;
      }
      default:
        // ignore others
        break;
    }
  }

  // If closed and last !== first, we can leave as-is; downstream may unify
  return { next: doneAt, poly };
}

function readPolylineSeq(pairs, i, end) {
  const poly = {
    layer: "",
    closed: false,
    vertices: [],
  };

  let flags = 0;
  let doneAt = i;

  // Read POLYLINE header props until we hit first 0 (VERTEX) or SEQEND
  for (let j = i; j < end; j++) {
    const [code, val] = pairs[j];
    doneAt = j;
    if (code === "0") {
      const type = (val || "").toUpperCase();
      if (type === "VERTEX") {
        const r = readVertex(pairs, j + 1, end);
        poly.vertices.push(r.vertex);
        j = r.next - 1;
        doneAt = j;
        // Continue reading additional VERTEX entities
        continue;
      } else if (type === "SEQEND") {
        // Completed polyline
        break;
      } else {
        // Unexpected entity — stop
        break;
      }
    } else {
      switch (code) {
        case "8": // layer
          poly.layer = val || "";
          break;
        case "70": // flags (closed bit)
          flags = parseIntSafe(val) || 0;
          poly.closed = (flags & 1) === 1;
          break;
        default:
          break;
      }
    }
  }

  return { next: doneAt, poly };
}

function readVertex(pairs, i, end) {
  const v = { x: 0, y: 0 };
  let doneAt = i;
  for (let j = i; j < end; j++) {
    const [code, val] = pairs[j];
    doneAt = j;
    if (code === "0") {
      // next entity
      break;
    }
    switch (code) {
      case "10":
        v.x = parseFloatSafe(val);
        break;
      case "20":
        v.y = parseFloatSafe(val);
        break;
      case "42":
        v.bulge = parseFloatSafe(val);
        break;
      default:
        break;
    }
  }
  return { next: doneAt, vertex: v };
}

// Read LINE entity and convert to a 2-point polyline
function readLine(pairs, i, end) {
  const poly = {
    layer: "",
    closed: false,
    vertices: [],
  };

  let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
  let doneAt = i;

  for (let j = i; j < end; j++) {
    doneAt = j;
    const [code, val] = pairs[j];

    if (code === "0") {
      // Entity ended
      break;
    }

    switch (code) {
      case "8": // layer
        poly.layer = val || "";
        break;
      case "10": // start point X
        x1 = parseFloatSafe(val);
        break;
      case "20": // start point Y
        y1 = parseFloatSafe(val);
        break;
      case "11": // end point X
        x2 = parseFloatSafe(val);
        break;
      case "21": // end point Y
        y2 = parseFloatSafe(val);
        break;
      default:
        // ignore others
        break;
    }
  }

  // Create 2-vertex polyline from line
  poly.vertices = [
    { x: x1, y: y1 },
    { x: x2, y: y2 }
  ];

  return { next: doneAt, poly };
}

// Read ARC entity and convert to polyline with bulge or approximation
function readArc(pairs, i, end) {
  const poly = {
    layer: "",
    closed: false,
    vertices: [],
  };

  let cx = 0, cy = 0, radius = 0, startAngle = 0, endAngle = 0;
  let doneAt = i;

  for (let j = i; j < end; j++) {
    doneAt = j;
    const [code, val] = pairs[j];

    if (code === "0") {
      // Entity ended
      break;
    }

    switch (code) {
      case "8": // layer
        poly.layer = val || "";
        break;
      case "10": // center X
        cx = parseFloatSafe(val);
        break;
      case "20": // center Y
        cy = parseFloatSafe(val);
        break;
      case "40": // radius
        radius = parseFloatSafe(val);
        break;
      case "50": // start angle (degrees)
        startAngle = parseFloatSafe(val) * Math.PI / 180; // convert to radians
        break;
      case "51": // end angle (degrees)
        endAngle = parseFloatSafe(val) * Math.PI / 180; // convert to radians
        break;
      default:
        // ignore others
        break;
    }
  }

  // Convert arc to start/end points
  const x1 = cx + radius * Math.cos(startAngle);
  const y1 = cy + radius * Math.sin(startAngle);
  const x2 = cx + radius * Math.cos(endAngle);
  const y2 = cy + radius * Math.sin(endAngle);

  // Calculate bulge for arc representation
  let deltaAngle = endAngle - startAngle;
  if (deltaAngle < 0) deltaAngle += 2 * Math.PI; // normalize to positive
  const bulge = Math.tan(deltaAngle / 4);

  poly.vertices = [
    { x: x1, y: y1, bulge: bulge },
    { x: x2, y: y2 }
  ];

  return { next: doneAt, poly };
}

function parseIntSafe(s) {
  const n = parseInt(String(s), 10);
  return Number.isFinite(n) ? n : 0;
}
function parseFloatSafe(s) {
  const n = parseFloat(String(s));
  return Number.isFinite(n) ? n : 0;
}
