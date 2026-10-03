const BASE = (process.env.TEKLA_BRIDGE_URL || "").replace(/\/+$/, "");
const KEY = process.env.TEKLA_BRIDGE_KEY || "";

function requireBase() {
  if (!BASE) throw new Error("TEKLA_BRIDGE_URL is missing");
}

function config() {
  requireBase();
  if (!KEY) throw new Error("TEKLA_BRIDGE_KEY is missing");
}

async function call(path, options={}) {
  config();
  const r = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {"Content-Type":"application/json","X-Tekla-Bridge-Key":KEY,...(options.headers||{})}
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { throw new Error(`Non-JSON bridge response: ${text}`); }
  if (!r.ok) throw new Error(`Tekla bridge HTTP ${r.status}: ${data?.error||""} ${data?.detail||""}`);
  return data;
}

async function publicGet(path) {
  requireBase();
  const r = await fetch(`${BASE}${path}`);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch { throw new Error(`Non-JSON bridge response: ${text}`); }
  if (!r.ok) throw new Error(`Tekla bridge HTTP ${r.status}: ${data?.error || ""} ${data?.detail || ""}`);
  return data;
}

export const teklaHealth = () => publicGet("/health");
export const teklaStatus = () => publicGet("/api/tekla/status");

export const teklaDiagnostic = () => call("/api/tekla/diagnostic",{method:"GET"});
export const teklaModel = () => call("/api/tekla/model",{method:"GET"});
export const teklaValidateModel = () => call("/api/tekla/model/validate",{method:"GET"});
export const teklaParts = (a={}) => call("/api/tekla/parts",{method:"POST",body:JSON.stringify(a)});
export const teklaObject = (a) => call("/api/tekla/object",{method:"POST",body:JSON.stringify(a)});
export const teklaSelection = (a={}) => call("/api/tekla/selection",{method:"POST",body:JSON.stringify(a)});
export const teklaAssemblies = (a={}) => call("/api/tekla/assemblies",{method:"POST",body:JSON.stringify(a)});
export const teklaAssembly = (a) => call("/api/tekla/assembly",{method:"POST",body:JSON.stringify(a)});
export const teklaBolts = (a={}) => call("/api/tekla/bolts",{method:"POST",body:JSON.stringify(a)});
export const teklaWelds = (a={}) => call("/api/tekla/welds",{method:"POST",body:JSON.stringify(a)});
export const teklaRebar = (a={}) => call("/api/tekla/rebar",{method:"POST",body:JSON.stringify(a)});
export const teklaRebarGroup = (a={}) => call("/api/tekla/rebar-group",{method:"POST",body:JSON.stringify(a)});
export const teklaDrawings = (a={}) => call("/api/tekla/drawings",{method:"POST",body:JSON.stringify(a)});
export const teklaDrawing = (a) => call("/api/tekla/drawing",{method:"POST",body:JSON.stringify(a)});
export const teklaAttributes = (a) => call("/api/tekla/attributes",{method:"POST",body:JSON.stringify(a)});

export const teklaCreateBeam = (a) => call("/api/tekla/create/beam",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateParametricStair = (a) => call("/api/tekla/create/parametric-stair",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateColumn = (a) => call("/api/tekla/create/column",{method:"POST",body:JSON.stringify(a)});
export const teklaCreatePlate = (a) => call("/api/tekla/create/plate",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateObject = (a) => call("/api/tekla/update/object",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateBeam = (a) => call("/api/tekla/update/beam",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateColumn = (a) => call("/api/tekla/update/column",{method:"POST",body:JSON.stringify({guid:a.guid,profile:a.profile,material:a.material,classNumber:a.classNumber,x1:a.x,y1:a.y,z1:a.z1,x2:a.x,y2:a.y,z2:a.z2,attributes:a.attributes})});
export const teklaUpdatePlate = (a) => call("/api/tekla/update/plate",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateAssembly = (a) => call("/api/tekla/update/assembly",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateWeld = (a) => call("/api/tekla/update/weld",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateBolt = (a) => call("/api/tekla/update/bolt",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateRebar = (a) => call("/api/tekla/update/rebar",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdateRebarGroup = (a) => call("/api/tekla/update/rebar-group",{method:"POST",body:JSON.stringify(a)});
export const teklaUpdatePhase = (a) => call("/api/tekla/update/phase",{method:"POST",body:JSON.stringify(a)});
export const teklaDeleteObject = (a) => call("/api/tekla/delete/object",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateAssembly = (a) => call("/api/tekla/create/assembly",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateWeld = (a) => call("/api/tekla/create/weld",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateBolt = (a) => call("/api/tekla/create/bolt",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateRebar = (a) => call("/api/tekla/create/rebar",{method:"POST",body:JSON.stringify(a)});
export const teklaCreateRebarGroup = (a) => call("/api/tekla/create/rebar-group",{method:"POST",body:JSON.stringify(a)});
export const teklaPhases = () => call("/api/tekla/phases",{method:"GET"});
export const teklaCreatePhase = (a) => call("/api/tekla/create/phase",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentList = () => call("/api/tekla/components/definitions",{method:"GET"});
export const teklaComponentGetDefinition = (a) => call("/api/tekla/components/definition/get",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentSaveDefinition = (a) => call("/api/tekla/components/definition/save",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentDeleteDefinition = (a) => call("/api/tekla/components/definition/delete",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentCloneDefinition = (a) => call("/api/tekla/components/definition/clone",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentExportDefinition = (a) => call("/api/tekla/components/definition/export",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentValidate = (a) => call("/api/tekla/components/validate",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentCreate = (a) => call("/api/tekla/components/create",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentGetInstance = (a) => call("/api/tekla/components/instance",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentClone = (a) => call("/api/tekla/components/clone",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentUpdate = (a) => call("/api/tekla/components/update",{method:"POST",body:JSON.stringify(a)});
export const teklaComponentDelete = (a) => call("/api/tekla/components/delete",{method:"POST",body:JSON.stringify(a)});
