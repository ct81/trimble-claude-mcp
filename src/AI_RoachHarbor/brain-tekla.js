import { convertDxfJson } from "./supraesophageal_ganglion_4_dxf.js";

const TEKLA_TOOLS = { column: "tekla_create_column" };

const num = (value) => {
  const n = Number(value);
  return value === null || value === undefined || value === "" || !Number.isFinite(n) ? undefined : n;
};

// Tekla profile syntax uses "*" (e.g. 300*300); DXF data often has "300x300".
const teklaProfile = (value) => String(value ?? "").trim().replace(/^(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)$/, "$1*$2");

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
    profile: teklaProfile(args.profile) ||
      (num(args.width) && num(args.depth) ? `${num(args.width)}*${num(args.depth)}` : "") ||
      defaults.profile,
    material: String(args.material ?? "").trim() || defaults.material,
    classNumber: String(args.class ?? "")
  };
}

const BUILDERS = { column: columnArgs };

export function brainToTekla(records, types, defaults = {}) {
  const fallback = {
    profile: String(defaults.profile || "").trim() || "300*300",
    material: String(defaults.material || "").trim() || "C30/37"
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
