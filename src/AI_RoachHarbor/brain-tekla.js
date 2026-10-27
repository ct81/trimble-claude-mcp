import { convertDxfJson } from "./supraesophageal_ganglion_4_dxf.js";

const num = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? undefined : n;
};

// Tekla profile syntax uses "*" (e.g. 300*300); DXF data often has "300x300".
const teklaProfile = (value) => String(value ?? "").trim().replace(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/, "$1*$2");

const round = (n) => Math.round(n * 10) / 10;

// Section from the DXF dimensions: Radius -> circular (D<diameter>), Width_mm x Depth_mm -> rectangular.
// Length_mm is the member length/height, not part of the section.
function sizeProfile(args, allowOutline = true) {
  const radius = num(args.attributes?.radius) ?? num(args.radius);
  const dia = radius ? radius * 2 : num(args.diameter) ?? num(args.attributes?.sourceDiameter);
  if (dia) return `D${round(dia)}`;
  const w = num(args.width), d = num(args.depth);
  if (w && d) return `${round(w)}*${round(d)}`;
  if (w || d) return `${round(w || d)}*${round(w || d)}`;
  return "";
}

function outlineProfile(args) {
  const pts = args.attributes?.vertices;
  if (!Array.isArray(pts) || pts.length < 3) return "";
  const xs = pts.map((p) => Number(p.x)), ys = pts.map((p) => Number(p.y));
  const bw = Math.max(...xs) - Math.min(...xs), bd = Math.max(...ys) - Math.min(...ys);
  return Number.isFinite(bw) && Number.isFinite(bd) && bw > 0 && bd > 0 ? `${round(bw)}*${round(bd)}` : "";
}

function profileFor(args, defaults, allowOutline = true) {
  return sizeProfile(args) || teklaProfile(args.profile) ||
    (allowOutline ? outlineProfile(args) : "") || defaults.profile;
}

function columnArgs(args, defaults) {
  const x = num(args.position?.x ?? args.startPoint?.x);
  const y = num(args.position?.y ?? args.startPoint?.y);
  const z1 = num(args.position?.z ?? args.startPoint?.z ?? args.level) ?? 0;
  const length = num(args.length);
  const endZ = num(args.endPoint?.z);
  const z2 = length !== undefined ? z1 + length : endZ;
  if (x === undefined || y === undefined || z2 === undefined || z2 === z1) {
    throw new Error("column needs x, y and a non-zero height (Length_mm)");
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
const plateProfile = (args, thickness) => {
  const explicit = String(args.profile ?? "").trim();
  if (explicit) return explicit;
  const t = num(thickness);
  return t ? `PL${round(t)}` : "PL200";
};
const vertexPoints = (args) => (args.attributes?.vertices || args.vertices || []).map((p) => pt(p, num(args.level) ?? 0)).filter(Boolean);

function beamArgs(args, defaults) {
  const level = num(args.level) ?? 0;
  const a = pt(args.startPoint, level), b = pt(args.endPoint, level);
  if (a && b) {
    if (same(a, b)) throw new Error("beam start and end points are the same");
    return {
      tool: "tekla_create_beam",
      arguments: {
        x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z,
        profile: profileFor(args, defaults),
        ...common(args, defaults)
      }
    };
  }
  const points = vertexPoints(args);
  if (points.length >= 2) return polybeamArgs(args, defaults, points);
  throw new Error("beam needs start/end points or vertices");
}

function polybeamArgs(args, defaults, points = vertexPoints(args)) {
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
      profile: plateProfile(args, args.depth ?? args.thickness),
      ...common(args, defaults)
    }
  };
}

// A vertical wall plate: base start, base end, and the top of the end point.
function wallArgs(args, defaults) {
  const level = num(args.level) ?? 0;
  const a = pt(args.startPoint, level), b = pt(args.endPoint, level);
  const height = num(args.height) ?? num(args.length);
  if (!a || !b || same(a, b)) throw new Error("wall needs distinct start and end points");
  if (!height) throw new Error("wall needs a height (Length_mm)");
  return {
    tool: "tekla_create_wall",
    arguments: {
      x1: a.x, y1: a.y, z1: a.z, x2: b.x, y2: b.y, z2: b.z, x3: b.x, y3: b.y, z3: b.z + height,
      profile: plateProfile(args, args.thickness ?? args.width),
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
  const length = num(args.length) ?? num(args.height);
  if (!length) throw new Error("pile needs a length (Length_mm)");
  const profile = profileFor(args, defaults, false);
  return verticalMember(args, defaults, top - length, top, profile);
}

// Footing: an outline becomes a plate; a single point becomes a short block. Elevation is the underside.
function footingArgs(args, defaults) {
  const thickness = num(args.thickness) ?? num(args.height) ?? num(args.length);
  if (vertexPoints(args).length >= 3) return slabArgs({ ...args, depth: args.depth ?? thickness }, defaults);
  if (!thickness) throw new Error("footing needs a thickness (Length_mm)");
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

export function brainToTekla(records, types, defaults = {}) {
  const fallback = {
    profile: String(defaults.profile || "").trim() || "300*300",
    material: String(defaults.material || "").trim() || "C30/37",
    classNumber: String(defaults.classNumber ?? "").trim()
  };
  const converted = convertDxfJson(records);
  const wanted = new Set(types);
  const calls = [];
  const skipped = [];
  for (const call of converted.calls) {
    const type = call.objectType;
    if (!wanted.has(type)) { skipped.push({ handle: call.handle, type, reason: "type not selected" }); continue; }
    if (!BUILDERS[type]) { skipped.push({ handle: call.handle, type, reason: "no Tekla tool mapping yet" }); continue; }
    try {
      calls.push({ handle: call.handle, type, ...BUILDERS[type](call.args, fallback) });
    } catch (error) {
      skipped.push({ handle: call.handle, type, reason: error.message });
    }
  }
  for (const item of converted.skipped) skipped.push({ handle: item.handle, type: "unknown", reason: "not classified" });
  return { totalRecords: converted.totalRecords, counts: converted.counts, calls, skipped };
}
