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
  {name:"tekla_validate_model",description:"Validate model connectivity and check parts for missing profile or material values.",inputSchema:schema({})},
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
  {name:"tekla_get_phases",description:"List phases in the open Tekla model.",inputSchema:schema({})},
  {name:"tekla_create_beam",description:"Create a Tekla beam. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x1","y1","z1","x2","y2","z2"])},
  {name:"tekla_create_column",description:"Create a Tekla column. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x:{type:"number"},y:{type:"number"},z1:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x","y","z1","z2"])},
  {name:"tekla_create_plate",description:"Create a Tekla plate. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},x3:{type:"number"},y3:{type:"number"},z3:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}},["x1","y1","z1","x2","y2","z2","x3","y3","z3"])},
  {name:"tekla_update_object",description:"Update a Tekla part's profile, material, class, or user-defined attributes. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_update_beam",description:"Update a Tekla beam's profile, material, class, endpoints, or user-defined attributes by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"},x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_update_column",description:"Update a Tekla column's profile, material, class, endpoints, or user-defined attributes by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"},x:{type:"number"},y:{type:"number"},z1:{type:"number"},z2:{type:"number"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_update_plate",description:"Update a Tekla plate's profile, material, class, or user-defined attributes by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_update_assembly",description:"Set user-defined attributes on a Tekla assembly by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid","attributes"])},
  {name:"tekla_update_weld",description:"Set user-defined attributes on a Tekla weld by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid","attributes"])},
  {name:"tekla_update_bolt",description:"Set user-defined attributes on a Tekla bolt by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid","attributes"])},
  {name:"tekla_update_rebar",description:"Update a Tekla rebar's properties, point path, or user-defined attributes by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},name:{type:"string"},size:{type:"string"},grade:{type:"string"},classNumber:{type:"string"},points:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_update_rebar_group",description:"Update a Tekla rebar group's properties, polygon paths, bar count, or user-defined attributes by GUID. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"},name:{type:"string"},size:{type:"string"},grade:{type:"string"},classNumber:{type:"string"},polygons:{type:"array",minItems:1,maxItems:99,items:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}}},barCount:{type:"integer",minimum:1},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"},attributes:{type:"object",additionalProperties:{type:"string"}}},["guid"])},
  {name:"tekla_delete_object",description:"Delete a Tekla object. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({guid:{type:"string"}},["guid"])},
  {name:"tekla_create_assembly",description:"Create an assembly from Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({mainPartGuid:{type:"string"},secondaryPartGuids:{type:"array",items:{type:"string"}}},["mainPartGuid","secondaryPartGuids"])},
  {name:"tekla_create_weld",description:"Create a weld between Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({mainPartGuid:{type:"string"},secondaryPartGuid:{type:"string"}},["mainPartGuid","secondaryPartGuid"])},
  {name:"tekla_create_bolt",description:"Create a bolt between Tekla parts. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({part1Guid:{type:"string"},part2Guid:{type:"string"},x:{type:"number"},y:{type:"number"},z:{type:"number"}},["part1Guid","part2Guid","x","y","z"])},
  {name:"tekla_create_rebar",description:"Create one Tekla rebar from an ordered point path. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({fatherGuid:{type:"string"},points:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}},size:{type:"string"},grade:{type:"string"},name:{type:"string"},classNumber:{type:"integer"},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"}},["fatherGuid","points"])},
  {name:"tekla_create_rebar_group",description:"Create a Tekla rebar group from polygon paths. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({fatherGuid:{type:"string"},polygons:{type:"array",minItems:1,maxItems:99,items:{type:"array",minItems:2,items:{type:"object",required:["x","y","z"],properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}}}},barCount:{type:"integer",minimum:1},size:{type:"string"},grade:{type:"string"},name:{type:"string"},classNumber:{type:"integer"},bendingRadius:{type:"number"},fromPlaneOffset:{type:"number"}},["fatherGuid","polygons","barCount"])},
  {name:"tekla_create_phase",description:"Create a phase in the Tekla model. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({phaseNumber:{type:"integer",minimum:1},phaseName:{type:"string"},phaseComment:{type:"string"},isCurrentPhase:{type:"boolean"}},["phaseNumber","phaseName"])},
  {name:"tekla_update_phase",description:"Update a Tekla phase by phase number. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({phaseNumber:{type:"integer",minimum:1},phaseName:{type:"string"},phaseComment:{type:"string"},isCurrentPhase:{type:"boolean"},DECOprogress:{type:"string"},DECOHold1:{type:"string"},DECOHold2:{type:"string"}},["phaseNumber"])}
  ,{name:"tekla_component_list",description:"List saved custom component definitions.",inputSchema:schema({})}
  ,{name:"tekla_component_get_definition",description:"Read a saved custom component definition by ID.",inputSchema:schema({id:{type:"string"}},["id"])}
  ,{name:"tekla_component_save_definition",description:"Create or replace a parameterized component definition. Geometry supports beam, column, contourPlate, concreteBeam, and rebarGroup recipes.",inputSchema:schema({definition:{type:"object"}},["definition"])}
  ,{name:"tekla_component_delete_definition",description:"Delete a saved custom component definition.",inputSchema:schema({id:{type:"string"}},["id"])}
  ,{name:"tekla_component_clone_definition",description:"Clone a component definition under a new ID.",inputSchema:schema({id:{type:"string"},newId:{type:"string"},name:{type:"string"}},["id","newId"])}
  ,{name:"tekla_component_export_definition",description:"Export a saved definition as JSON content.",inputSchema:schema({id:{type:"string"}},["id"])}
  ,{name:"tekla_component_validate",description:"Validate a component definition and resolve typed parameters without modifying the model.",inputSchema:schema({definition:{type:"object"},parameters:{type:"object"}},["definition"])}
  ,{name:"tekla_component_create",description:"Instantiate a saved component definition in the active Tekla model. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({definitionId:{type:"string"},instanceId:{type:"string"},parameters:{type:"object"}},["definitionId"])}
  ,{name:"tekla_component_get_instance",description:"Read a saved component instance manifest by instance ID.",inputSchema:schema({id:{type:"string"}},["id"])}
  ,{name:"tekla_component_clone",description:"Create a new Tekla component instance from an existing instance, optionally overriding parameters. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({id:{type:"string"},newInstanceId:{type:"string"},parameters:{type:"object"}},["id"])}
  ,{name:"tekla_component_update",description:"Rebuild a component instance using updated parameter values. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({instanceId:{type:"string"},parameters:{type:"object"}},["instanceId"])}
  ,{name:"tekla_component_delete",description:"Delete a component instance and the Tekla objects created by it. MODEL MODIFICATION: require explicit approval.",inputSchema:schema({id:{type:"string"}},["id"])}
];

export async function callTeklaTool(name,args={}) {
  switch(name) {
    case "tekla_health": return t.teklaHealth();
    case "tekla_status": return t.teklaStatus();
    case "tekla_diagnostic": return t.teklaDiagnostic();
    case "tekla_get_model": return t.teklaModel();
    case "tekla_validate_model": return t.teklaValidateModel();
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
    case "tekla_get_phases": return t.teklaPhases();
    case "tekla_create_beam": return t.teklaCreateBeam(args);
    case "tekla_create_column": return t.teklaCreateColumn(args);
    case "tekla_create_plate": return t.teklaCreatePlate(args);
    case "tekla_update_object": return t.teklaUpdateObject(args);
    case "tekla_update_beam": return t.teklaUpdateBeam(args);
    case "tekla_update_column": return t.teklaUpdateColumn(args);
    case "tekla_update_plate": return t.teklaUpdatePlate(args);
    case "tekla_update_assembly": return t.teklaUpdateAssembly(args);
    case "tekla_update_weld": return t.teklaUpdateWeld(args);
    case "tekla_update_bolt": return t.teklaUpdateBolt(args);
    case "tekla_update_rebar": return t.teklaUpdateRebar(args);
    case "tekla_update_rebar_group": return t.teklaUpdateRebarGroup(args);
    case "tekla_update_phase": return t.teklaUpdatePhase(args);
    case "tekla_component_list": return t.teklaComponentList();
    case "tekla_component_get_definition": return t.teklaComponentGetDefinition(args);
    case "tekla_component_save_definition": return t.teklaComponentSaveDefinition(args.definition);
    case "tekla_component_delete_definition": return t.teklaComponentDeleteDefinition(args);
    case "tekla_component_clone_definition": return t.teklaComponentCloneDefinition(args);
    case "tekla_component_export_definition": return t.teklaComponentExportDefinition(args);
    case "tekla_component_validate": return t.teklaComponentValidate(args);
    case "tekla_component_create": return t.teklaComponentCreate(args);
    case "tekla_component_get_instance": return t.teklaComponentGetInstance(args);
    case "tekla_component_clone": return t.teklaComponentClone(args);
    case "tekla_component_update": return t.teklaComponentUpdate(args);
    case "tekla_component_delete": return t.teklaComponentDelete(args);
    case "tekla_delete_object": return t.teklaDeleteObject(args);
    case "tekla_create_assembly": return t.teklaCreateAssembly(args);
    case "tekla_create_weld": return t.teklaCreateWeld(args);
    case "tekla_create_bolt": return t.teklaCreateBolt(args);
    case "tekla_create_rebar": return t.teklaCreateRebar(args);
    case "tekla_create_rebar_group": return t.teklaCreateRebarGroup(args);
    case "tekla_create_phase": return t.teklaCreatePhase(args);
    default: throw new Error(`Unknown Tekla MCP tool: ${name}`);
  }
}
