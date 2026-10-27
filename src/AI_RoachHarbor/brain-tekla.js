import { convertDxfJson } from "./supraesophageal_ganglion_4_dxf.js";

const TEKLA_TOOLS = { column: "tekla_create_column" };

const num = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? undefined : n;
};

// Tekla profile syntax uses "*" (e.g. 300*300); DXF data often has "300x300".
const teklaProfile = (value) => String(value ?? "").trim().replace(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/, "$1*$2");

const round = (n) => Math.round(n * 10) / 10;

// Section size from the DXF: width/depth, circle diameter, or the bounding box of a closed outline.
function sizeProfile(args) {
  const w = num(args.width), d = num(args.depth);
  if (w && d) return `${round(w)}*${round(d)}`;
  const dia = num(args.diameter) ?? num(args.attributes?.sourceDiameter);
  if (dia) return `D${round(dia)}`;
  const pts = args.attributes?.vertices;
  if (Array.isArray(pts) && pts.length >= 3) {
    const xs = pts.map((p) => Number(p.x)), ys = pts.map((p) => Number(p.y));
    const bw = Math.max(...xs) - Math.min(...xs), bd = Math.max(...ys) - Math.min(...ys);
    if (Number.isFinite(bw) && Number.isFinite(bd) && bw > 0 && bd > 0) return `${round(bw)}*${round(bd)}`;
  }
  return "";
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
    profile: teklaProfile(args.profile) || sizeProfile(args) || defaults.profile,
    material: String(args.material ?? "").trim() || defaults.material,
    classNumber: String(args.class ?? "").trim() || defaults.classNumber
  };
}

const BUILDERS = { column: columnArgs };

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
      calls.push({ handle: call.handle, type, tool: TEKLA_TOOLS[type], arguments: BUILDERS[type](call.args, fallback) });
    } catch (error) {
      skipped.push({ handle: call.handle, type, reason: error.message });
    }
  }
  for (const item of converted.skipped) skipped.push({ handle: item.handle, type: "unknown", reason: "not classified" });
  return { totalRecords: converted.totalRecords, counts: converted.counts, calls, skipped };
}
