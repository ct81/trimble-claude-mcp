import { annotationSkipReason, beamArcPoints, beamCallRejection, buildGridDefinition, convertDxfJson, dimensionedBeam, duplicateCallKey, extractGridlineData, wallOutlineCentreline } from "./supraesophageal_ganglion_4_dxf.js";

const num = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? undefined : n;
};

// Tekla profile syntax uses "*" (e.g. 300*300); DXF data often has "300x300".
const teklaProfile = (value) => String(value ?? "").trim().replace(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/, "$1*$2");

const round = (n) => Math.round(n * 10) / 10;

// Reads a dimension straight from the raw DXF record: case-insensitive keys, unit suffixes ("300 mm"),
// and _m fields converted to millimetres. Used because exports name these fields inconsistently.
function rawDim(src, names) {
  if (!src || typeof src !== "object") return undefined;
  const lower = new Map(Object.keys(src).map((k) => [k.toLowerCase().replace(/[\s-]+/g, "_"), k]));
  for (const name of names) {
    const key = lower.get(name);
    if (key === undefined) continue;
    const raw = src[key];
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) continue;
    return /_m$/.test(name) ? n * 1000 : n;
  }
  return undefined;
}

const SIZE_TEXT = /(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)/;

// Section from the DXF dimensions: Radius -> circular (D<diameter>), Width x Depth -> rectangular.
// Length_mm is the member length/height, not part of the section.
function sizeProfile(args) {
  const src = args._src;
  const isArc = String(src?.Type ?? src?.type ?? args.attributes?.dxfEntityType ?? "").toUpperCase() === "ARC";
  const radius = isArc ? undefined : rawDim(src, ["radius", "radius_mm", "r", "radius_m"]) ?? num(args.attributes?.radius) ?? num(args.radius);
  if (radius) return { profile: `D${round(radius * 2)}`, from: "Radius" };
  const dia = rawDim(src, ["diameter", "diameter_mm", "dia", "dia_mm", "diameter_m"]) ?? (isArc ? undefined : num(args.diameter));
  if (dia) return { profile: `D${round(dia)}`, from: "Diameter" };

  const w = rawDim(src, ["width_mm", "width", "w", "width_m"]) ?? num(args.width);
  const d = rawDim(src, ["depth_mm", "depth", "d", "depth_m"]) ?? num(args.depth);
  if (w && d) return { profile: `${round(w)}*${round(d)}`, from: "Width_mm x Depth_mm" };
  if (w || d) return { profile: `${round(w || d)}*${round(w || d)}`, from: w ? "Width_mm" : "Depth_mm" };
  return null;
}

function textProfile(args) {
  const src = args._src || {};
  for (const key of Object.keys(src)) {
    if (!/^(profile|section|size|section_?name|block_?name|name)$/i.test(key)) continue;
    const text = String(src[key] ?? "").trim();
    if (!text) continue;
    if (SIZE_TEXT.test(text)) return { profile: text.match(SIZE_TEXT).slice(1, 3).join("*"), from: key };
    if (/^profile$/i.test(key)) return { profile: text, from: key };
  }
  const explicit = teklaProfile(args.profile);
  return explicit ? { profile: explicit, from: "profile" } : null;
}

function outlineProfile(args) {
  const pts = args.attributes?.vertices;
  if (!Array.isArray(pts) || pts.length < 3) return "";
  const xs = pts.map((p) => Number(p.x)), ys = pts.map((p) => Number(p.y));
  const bw = Math.max(...xs) - Math.min(...xs), bd = Math.max(...ys) - Math.min(...ys);
  return Number.isFinite(bw) && Number.isFinite(bd) && bw > 0 && bd > 0 ? `${round(bw)}*${round(bd)}` : "";
}

function profileFor(args, defaults, allowOutline = true) {
  const found = sizeProfile(args) || textProfile(args) ||
    (allowOutline && outlineProfile(args) ? { profile: outlineProfile(args), from: "outline" } : null);
  args._profileFrom = found ? found.from : "default";
  return found ? found.profile : defaults.profile;
}

function columnArgs(args, defaults) {
  const outlinePts = vertexPoints(args);
  const bx = outlinePts.map((p) => p.x), by = outlinePts.map((p) => p.y);
  const centre = /POLYLINE/i.test(String(args._src?.Type ?? "")) && outlinePts.length >= 3
    ? { x: (Math.min(...bx) + Math.max(...bx)) / 2, y: (Math.min(...by) + Math.max(...by)) / 2 }
    : null;
  const x = centre ? centre.x : num(args.position?.x ?? args.startPoint?.x);
  const y = centre ? centre.y : num(args.position?.y ?? args.startPoint?.y);
  const z1 = num(args.position?.z ?? args.startPoint?.z ?? args.level) ?? 0;
  const entity = String(args._src?.Type ?? args.attributes?.dxfEntityType ?? "").toUpperCase();
  const isCircle = entity === "CIRCLE";
  const isOutline = /POLYLINE/.test(entity) && vertexPoints(args).length >= 3;
  let z2;
  if (isCircle || isOutline) {
    // Plan-view section: Length_mm is the outline perimeter, so the height comes from the Brain default.
    if (!defaults.height) throw new Error("set a default column height on the Brain node");
    z2 = z1 + defaults.height;
  } else {
    const vertical = args.startPoint && args.endPoint &&
      args.startPoint.x === args.endPoint.x && args.startPoint.y === args.endPoint.y;
    if (!vertical && !(entity === "INSERT" || entity === "POINT")) {
      throw new Error(`${entity || "entity"} is not a column section or vertical line`);
    }
    const length = num(args.length);
    const endZ = num(args.endPoint?.z);
    z2 = length !== undefined ? z1 + length : endZ !== undefined && endZ !== z1 ? endZ : defaults.height ? z1 + defaults.height : undefined;
  }
  if (x === undefined || y === undefined || z2 === undefined || z2 === z1) {
    throw new Error("column needs x, y and a non-zero height");
  }
  return {
    x, y, z1, z2,
    profile: profileFor(args, defaults),
    material: String(args.material ?? "").trim() || defaults.material,
    classNumber: String(args.class ?? "").trim() || defaults.classNumber
  };
}

const same = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z;
const pt = (p, zFallback = 0) => {
  const x = num(p?.x), y = num(p?.y), z = num(p?.z) ?? zFallback;
  return x === undefined || y === undefined ? undefined : { x, y, z };
};
const common = (args, defaults) => ({
  material: String(args.material ?? "").trim() || defaults.material,
  classNumber: String(args.class ?? "").trim() || defaults.classNumber
});
// Plates use the profile set for the type on the Brain node; otherwise PL<thickness>.
const plateProfile = (args, thickness, defaults) => {
  const configured = String(defaults?.profile ?? "").trim();
  if (configured) return configured;
  const t = num(thickness);
  return t ? `PL${round(t)}` : "PL200";
};
// An entered Z level overrides source elevation; a blank setting preserves it.
const baseZ = (args) => args._zOverride ?? num(args.level) ?? args._zDefault ?? 0;
const modelPoint = (p, args) => pt(args._zOverride === undefined ? p : { ...p, z: args._zOverride }, baseZ(args));
const vertexPoints = (args) => (args.attributes?.vertices || args.vertices || []).map((p) => modelPoint(p, args)).filter(Boolean);

function beamEntityType(args) {
  const entity = String(args.attributes?.dxfEntityType ?? "").toUpperCase();
  if (entity && !["LINE", "POLYLINE", "LWPOLYLINE", "ARC"].includes(entity)) {
    throw new Error(`${entity} is not a beam path`);
  }
  return entity;
}

function beamArgs(args, defaults) {
  const entity = beamEntityType(args);
  if (entity === "ARC") return polybeamArgs(args, defaults);
  const a = modelPoint(args.startPoint, args), b = modelPoint(args.endPoint, args);
  if (a && b) {
    if (same(a, b)) throw new Error("beam start and end points are the same");
    const dimensions = dimensionedBeam(a, b, args);
    if (dimensions) {
      Object.assign(b, dimensions.endPoint);
      args._dimensionProfile = dimensions.profile;
      args._profileFrom = "Width_mm x Depth_mm";
    }
    return {
      tool: "tekla_create_beam",
      arguments: {
        x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z,
        profile: args._dimensionProfile || profileFor(args, defaults, false),
        ...common(args, defaults)
      }
    };
  }
  throw new Error("beam needs start/end points");
}

function polybeamArgs(args, defaults, points = beamArcPoints(args._src, baseZ(args), args._zOverride)) {
  if (points.length < 2) throw new Error("polybeam needs at least 2 points");
  return {
    tool: "tekla_create_polybeam",
    arguments: {
      points,
      profile: profileFor(args, defaults, false),
      ...common(args, defaults)
    }
  };
}

// Tekla slab tool takes three contour points; the first three distinct vertices are used.
function slabArgs(args, defaults) {
  const unique = [];
  for (const p of vertexPoints(args)) if (!unique.some((q) => same(p, q))) unique.push(p);
  if (unique.length < 3) throw new Error("slab needs a closed outline with 3+ distinct vertices");
  const [a, b, c] = unique;
  return {
    tool: "tekla_create_slab",
    arguments: {
      x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z, x3: c.x, y3: c.y, z3: c.z,
      profile: plateProfile(args, args.depth ?? args.thickness, defaults),
      ...common(args, defaults)
    }
  };
}

// A vertical wall plate: base start, base end, and the top of the end point.
function wallArgs(args, defaults) {
  const level = num(args.level) ?? 0;
  const a = pt(args.startPoint, level), b = pt(args.endPoint, level);
  const requestedShape = String(defaults.shape ?? "").trim().toLowerCase();
  const shape = requestedShape || "rectangle";
  if (!["rectangle", "triangle", "square"].includes(shape)) {
    throw new Error("wall shape must be rectangle, triangle, or square");
  }
  // Wall height: the type's height setting wins, since Length_mm of a plan line is the wall's run, not its height.
  const configuredHeight = defaults.height || num(args.height) || num(args.length);
  const pts = [];
  for (const p of vertexPoints(args)) if (!pts.length || !same(p, pts[pts.length - 1])) pts.push(p);
  const flagged = /^(yes|true|1)$/i.test(String(args._src?.Closed ?? ""));
  const closed = pts.length > 2 && (flagged || same(pts[0], pts[pts.length - 1]));
  if (closed && same(pts[0], pts[pts.length - 1])) pts.pop();
  if (closed && shape === "triangle") {
    if (pts.length !== 3) throw new Error("triangle wall shape needs a closed 3-point outline");
    const [p, q, r] = pts;
    return {
      tool: "tekla_create_wall",
      arguments: {
        x1: p.x, y1: p.y, z1: p.z, x2: q.x, y2: q.y, z2: q.z, x3: r.x, y3: r.y, z3: r.z,
        shape: "triangle",
        profile: plateProfile(args, args.thickness ?? args.width, defaults),
        ...common(args, defaults)
      }
    };
  }
  if (!a || !b || same(a, b) || pts.length > 2) {
    if (pts.length < 2) throw new Error("wall needs distinct start and end points");
    if (requestedShape === "triangle" && closed) throw new Error("triangle wall shape needs a closed 3-point outline");
    if (requestedShape && shape !== "triangle" && closed && pts.length !== 4) {
      throw new Error(`${shape} wall shape needs a closed 4-point outline`);
    }
    if (!configuredHeight && shape !== "square") throw new Error("wall needs a height (set it on the Brain node)");
    const profile = plateProfile(args, args.thickness ?? args.width, defaults);
    const wall = (p, q) => ({
      tool: "tekla_create_wall",
      arguments: {
        x1: p.x, y1: p.y, z1: p.z, x2: q.x, y2: q.y, z2: q.z,
        x3: q.x, y3: q.y, z3: q.z + (shape === "square" ? Math.hypot(q.x - p.x, q.y - p.y) : configuredHeight),
        ...(shape === "triangle" ? { shape } : { x4: p.x, y4: p.y, z4: p.z + (shape === "square" ? Math.hypot(q.x - p.x, q.y - p.y) : configuredHeight) }),
        profile, ...common(args, defaults)
      }
    });
    // A thin-rectangle outline is ONE wall along its long-axis centreline. Closed outlines
    // are trusted as drawn; open outlines (closing edge left undrawn) collapse only when
    // their edges really form a rectangle, so multi-leg wall runs still become segments.
    if (pts.length === 4) {
      const outline = wallOutlineCentreline(pts, { requireRectangle: !closed });
      if (outline) return wall(outline.start, outline.end);
    }
    // Otherwise each segment becomes a wall.
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) segs.push(wall(pts[i], pts[i + 1]));
    if (closed) segs.push(wall(pts[pts.length - 1], pts[0]));
    return segs;
  }
  if (!configuredHeight && shape !== "square") throw new Error("wall needs a height (set it on the Brain node)");
  const height = shape === "square" ? Math.hypot(b.x - a.x, b.y - a.y) : configuredHeight;
  return {
    tool: "tekla_create_wall",
    arguments: {
      x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z, x3: b.x, y3: b.y, z3: b.z + height,
      ...(shape === "triangle" ? { shape } : { x4: a.x, y4: a.y, z4: a.z + height }),
      profile: plateProfile(args, args.thickness ?? args.width, defaults),
      ...common(args, defaults)
    }
  };
}

function verticalMember(args, defaults, z1, z2, profile) {
  const p = pt(args.position ?? args.startPoint ?? args.attributes?.centerPoint, num(args.level) ?? 0);
  if (!p) throw new Error("needs an x/y position");
  if (z1 === z2) throw new Error("needs a non-zero height/length");
  return {
    tool: "tekla_create_column",
    arguments: { x: p.x, y: p.y, z1, z2, profile, ...common(args, defaults) }
  };
}

// Pile: Elevation is the pile head; it extends down by Length_mm.
function pileArgs(args, defaults) {
  const top = num(args.position?.z) ?? num(args.level) ?? 0;
  const length = defaults.height || num(args.length) || num(args.height);
  if (!length) throw new Error("pile needs a length (set it on the Brain node)");
  const profile = profileFor(args, defaults, false);
  return verticalMember(args, defaults, top - length, top, profile);
}

// Footing: an outline becomes a plate; a single point becomes a short block. Elevation is the underside.
function footingArgs(args, defaults) {
  const thickness = defaults.height || num(args.thickness) || num(args.height) || num(args.length);
  if (vertexPoints(args).length >= 3) return slabArgs({ ...args, depth: thickness }, { ...defaults, profile: "" });
  if (!thickness) throw new Error("footing needs a thickness (set it on the Brain node)");
  const bottom = num(args.position?.z) ?? num(args.level) ?? 0;
  const profile = profileFor(args, defaults, false);
  return verticalMember(args, defaults, bottom, bottom + thickness, profile);
}

const BUILDERS = {
  footing: footingArgs,
  pile: pileArgs,
  column: (args, defaults) => ({ tool: "tekla_create_column", arguments: columnArgs(args, defaults) }),
  beam: beamArgs,
  polybeam: polybeamArgs,
  slab: slabArgs,
  wall: wallArgs
};

const BRAIN_VERSION = "2026-10-27.per-type-settings";

const BUILT_IN_DEFAULTS = {
  column: { profile: "300*300", height: 3000 },
  beam: { profile: "300*600", height: 0 },
  polybeam: { profile: "300*600", height: 0 },
  wall: { profile: "PL200", height: 3000 },
  slab: { profile: "PL200", height: 0 },
  footing: { profile: "", height: 600 },
  pile: { profile: "D400", height: 12000 }
};

// defaults = { column: { profile, material, height, classNumber }, beam: {...}, ... }
function settingsFor(type, defaults) {
  const own = defaults?.[type] && typeof defaults[type] === "object" ? defaults[type] : {};
  const built = BUILT_IN_DEFAULTS[type] || {};
  const text = (v, d) => (v === undefined || v === null ? d : String(v).trim());
  return {
    profile: text(own.profile, built.profile ?? ""),
    material: text(own.material, "C30/37") || "C30/37",
    classNumber: text(own.classNumber, ""),
    height: num(own.height) ?? built.height,
    shape: text(own.shape, "")
  };
}

export function brainToTekla(records, types, defaults = {}) {
  const converted = convertDxfJson(records);
  const wanted = new Set(types);
  const calls = [];
  const skipped = converted.skipped
    .filter(call => ["beam", "polybeam"].includes(call.objectType))
    .map(call => ({ handle: call.handle, type: call.objectType, reason: wanted.has(call.objectType) ? call.classification.reason : "type not selected" }));
  const seen = new Set();
  for (const call of converted.calls) {
    const type = call.objectType;
    if (!wanted.has(type)) { skipped.push({ handle: call.handle, type, reason: "type not selected" }); continue; }
    // Tag/annotation graphics (e.g. S-_WALL----_T label layers) are not structural members.
    const annotation = annotationSkipReason(call.source);
    if (annotation) { skipped.push({ handle: call.handle, type, reason: annotation }); continue; }
    if (!BUILDERS[type]) { skipped.push({ handle: call.handle, type, reason: "no Tekla tool mapping yet" }); continue; }
    try {
      const args = { ...call.args, _src: call.source };
      const settings = settingsFor(type, defaults);
      const profiles = converted.profilesByType[type] || [];
      if (!settings.profile && profiles.length === 1) {
        settings.profile = profiles[0];
      }
      if (["beam", "polybeam", "slab"].includes(type)) {
        args._zDefault = settings.height;
        args._zOverride = num(defaults?.[type]?.height);
      }
      const result = BUILDERS[type](args, settings);
      for (const built of Array.isArray(result) ? result : [result]) {
        if (["beam", "polybeam"].includes(type)) {
          const reason = beamCallRejection({ type, ...built });
          if (reason) { skipped.push({ handle: call.handle, type, reason }); continue; }
        }
        // Same type at the same place counts once, even if drawn with different shapes (e.g. circle + outline).
        const key = duplicateCallKey(type, built.tool, built.arguments);
        if (seen.has(key)) { skipped.push({ handle: call.handle, type, reason: "duplicate of an earlier object" }); continue; }
        seen.add(key);
        calls.push({ handle: call.handle, type, ...built, profileFrom: args._profileFrom || "n/a" });
      }
    } catch (error) {
      skipped.push({ handle: call.handle, type, reason: error.message });
    }
  }
  const gridlines = wanted.has("gridline") ? extractGridlineData(records) : [];
  let grid = null;
  if (gridlines.length) {
    const result = buildGridDefinition(gridlines);
    grid = result.grid;
    skipped.push(...result.skipped);
    if (grid) calls.push({ type: "gridline", tool: "tekla_create_grid", arguments: grid });
  }
  const mapped = {};
  for (const c of calls) mapped[c.tool] = (mapped[c.tool] || 0) + 1;
  const counts = Object.fromEntries(Object.entries(converted.counts).filter(([type]) => type !== "unknown" && type !== "ignored"));
  const gridWarnings = grid ? ["The parent grid uses common rectangular extents; individual DXF line lengths may differ. Verify the grid in Tekla."] : [];
  return { version: BRAIN_VERSION, totalRecords: converted.calls.length, counts, mapped, calls, skipped, gridlines, grid, gridWarnings, beamProfiles: converted.beamProfiles, profilesByType: converted.profilesByType };
}
