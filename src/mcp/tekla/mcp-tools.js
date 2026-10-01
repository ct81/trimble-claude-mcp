import * as t from "./bridge.js";

const schema = (properties, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {})
});

export const tools = [
  {name:"tekla_health",description:"Check whether the bridge and Tekla connection are available.",inputSchema:schema({})},
  {name:"tekla_status",description:"Get bridge and Tekla connection status.",inputSchema:schema({})},
  {name:"tekla_diagnostic",description:"Get bridge runtime, Tekla API, and model diagnostics.",inputSchema:schema({})},
  {name:"tekla_get_model",description:"Get information about the currently open Tekla model.",inputSchema:schema({})},
  {name:"tekla_find_objects",description:"Find/list Tekla model parts.",inputSchema:schema({limit:{type:"integer"},type:{type:"string"}})},
  {name:"tekla_get_properties",description:"Get a Tekla object by GUID.",inputSchema:schema({guid:{type:"string"}},["guid"])},
  {name:"tekla_get_selection",description:"Read the current Tekla selection.",inputSchema:schema({limit:{type:"integer"}})},
  {name:"tekla_get_attributes",description:"Read a named attribute from a Tekla object.",inputSchema:schema({guid:{type:"string"},name:{type:"string"}},["guid","name"])},
  {name:"tekla_get_assemblies",description:"List Tekla assemblies.",inputSchema:schema({limit:{type:"integer"}})},
  {name:"tekla_get_assembly",description:"Get a Tekla assembly by GUID.",inputSchema:schema({guid:{type:"string"}},["guid"])},
  {name:"tekla_get_rebar",description:"Read Tekla rebar information.",inputSchema:schema({guid:{type:"string"},limit:{type:"integer"}})},
  {name:"tekla_get_rebar_group",description:"Read Tekla rebar group information.",inputSchema:schema({guid:{type:"string"},limit:{type:"integer"}})},
  {name:"tekla_get_welds",description:"Read Tekla weld information.",inputSchema:schema({limit:{type:"integer"}})},
  {name:"tekla_get_bolts",description:"Read Tekla bolt information.",inputSchema:schema({limit:{type:"integer"}})},
  {name:"tekla_get_drawings",description:"List Tekla drawings.",inputSchema:schema({identifier:{type:"string"},limit:{type:"integer"}})},
  {name:"tekla_get_drawing",description:"Get a Tekla drawing by identifier.",inputSchema:schema({identifier:{type:"string"},limit:{type:"integer"}},["identifier"])},
  {name:"tekla_create_beam",description:"Create a Tekla beam. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x1","y1","z1","x2","y2","z2"])},
  {name:"tekla_create_column",description:"Create a Tekla column. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x:{type:"number"},y:{type:"number"},z1:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x","y","z1","z2"])},
  {name:"tekla_create_plate",description:"Create a Tekla plate. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},x3:{type:"number"},y3:{type:"number"},z3:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x1","y1","z1","x2","y2","z2","x3","y3","z3"])},
  {name:"tekla_update_object",description:"Update a Tekla part. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["guid"])},
  {name:"tekla_delete_object",description:"Delete a Tekla object. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"}},["guid"])},
  {name:"tekla_create_assembly",description:"Create an assembly from Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({mainPartGuid:{type:"string"},secondaryPartGuids:{type:"array",items:{type:"string"}}},["mainPartGuid","secondaryPartGuids"])},
  {name:"tekla_create_weld",description:"Create a weld between Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({mainPartGuid:{type:"string"},secondaryPartGuid:{type:"string"}},["mainPartGuid","secondaryPartGuid"])},
  {name:"tekla_create_bolt",description:"Create a bolt between Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({part1Guid:{type:"string"},part2Guid:{type:"string"},x:{type:"number"},y:{type:"number"},z:{type:"number"}},["part1Guid","part2Guid","x","y","z"])},
  {name:"tekla_create_rebar",description:"Create one Tekla rebar from an ordered point path. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({fatherGuid:{type:"string"},points:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}},size:{type:"string"},grade:{type:"string"},name:{type:"string"},classNumber:{type:"integer"},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"}},["fatherGuid","points"])},
  {name:"tekla_create_rebar_group",description:"Create a Tekla rebar group from polygon paths. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({fatherGuid:{type:"string"},polygons:{type:"array",minItems:1,maxItems:99,items:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}}},barCount:{type:"integer",minimum:1},size:{type:"string"},grade:{type:"string"},name:{type:"string"},classNumber:{type:"integer"},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"}},["fatherGuid","polygons","barCount"])}
];

export async function callTeklaTool(name,args={}) {
  switch(name) {
    case "tekla_health": return t.teklaHealth();
    case "tekla_status": return t.teklaStatus();
    case "tekla_diagnostic": return t.teklaDiagnostic();
    case "tekla_get_model": return t.teklaModel();
    case "tekla_find_objects": return t.teklaParts(args);
    case "tekla_get_properties": return t.teklaObject(args);
    case "tekla_get_selection": return t.teklaSelection(args);
    case "tekla_get_attributes": return t.teklaAttributes(args);
    case "tekla_get_assemblies": return t.teklaAssemblies(args);
    case "tekla_get_assembly": return t.teklaAssembly(args);
    case "tekla_get_rebar": return t.teklaRebar(args);
    case "tekla_get_rebar_group": return t.teklaRebarGroup(args);
    case "tekla_get_welds": return t.teklaWelds(args);
    case "tekla_get_bolts": return t.teklaBolts(args);
    case "tekla_get_drawings": return t.teklaDrawings(args);
    case "tekla_get_drawing": return t.teklaDrawing(args);
    case "tekla_create_beam": return t.teklaCreateBeam(args);
    case "tekla_create_column": return t.teklaCreateColumn(args);
    case "tekla_create_plate": return t.teklaCreatePlate(args);
    case "tekla_update_object": return t.teklaUpdateObject(args);
    case "tekla_delete_object": return t.teklaDeleteObject(args);
    case "tekla_create_assembly": return t.teklaCreateAssembly(args);
    case "tekla_create_weld": return t.teklaCreateWeld(args);
    case "tekla_create_bolt": return t.teklaCreateBolt(args);
    case "tekla_create_rebar": return t.teklaCreateRebar(args);
    case "tekla_create_rebar_group": return t.teklaCreateRebarGroup(args);
    default: throw new Error(`Unknown Tekla MCP tool: ${name}`);
  }
}
