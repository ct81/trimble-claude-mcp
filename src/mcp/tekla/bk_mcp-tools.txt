import * as t from "./bridge.js";

export const tools = [
  {name:"tekla_find_objects",description:"Find/list Tekla model parts.",inputSchema:{type:"object",properties:{limit:{type:"integer"},type:{type:"string"}}}},
  {name:"tekla_get_properties",description:"Get a Tekla object by GUID.",inputSchema:{type:"object",required:["guid"],properties:{guid:{type:"string"}}}},
  {name:"tekla_get_assemblies",description:"List Tekla assemblies.",inputSchema:{type:"object",properties:{limit:{type:"integer"}}}},
  {name:"tekla_get_rebar",description:"Read Tekla rebar information.",inputSchema:{type:"object",properties:{guid:{type:"string"},limit:{type:"integer"}}}},
  {name:"tekla_get_welds",description:"Read Tekla weld information.",inputSchema:{type:"object",properties:{limit:{type:"integer"}}}},
  {name:"tekla_get_bolts",description:"Read Tekla bolt information.",inputSchema:{type:"object",properties:{limit:{type:"integer"}}}},
  {name:"tekla_create_beam",description:"Create a Tekla beam. MODEL MODIFICATION: require explicit approval.",inputSchema:{type:"object",required:["x1","y1","z1","x2","y2","z2"],properties:{x1:{type:"number"},y1:{type:"number"},z1:{type:"number"},x2:{type:"number"},y2:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}}}},
  {name:"tekla_create_column",description:"Create a Tekla column. MODEL MODIFICATION: require explicit approval.",inputSchema:{type:"object",required:["x","y","z1","z2"],properties:{x:{type:"number"},y:{type:"number"},z1:{type:"number"},z2:{type:"number"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}}}},
  {name:"tekla_update_object",description:"Update a Tekla part. MODEL MODIFICATION: require explicit approval.",inputSchema:{type:"object",required:["guid"],properties:{guid:{type:"string"},profile:{type:"string"},material:{type:"string"},classNumber:{type:"string"}}}},
  {name:"tekla_delete_object",description:"Delete a Tekla object. MODEL MODIFICATION: require explicit approval.",inputSchema:{type:"object",required:["guid"],properties:{guid:{type:"string"}}}},
  {name:"tekla_export_ifc",description:"Export the Tekla model to IFC. Implement the export worker for your Tekla version before enabling this tool.",inputSchema:{type:"object",properties:{filePath:{type:"string"}}}},
  {name:"tekla_create_drawing",description:"Create a Tekla drawing. Implement and validate the drawing worker for your Tekla version before enabling this tool.",inputSchema:{type:"object",properties:{identifier:{type:"string"}}}}
];

export async function callTeklaTool(name,args={}) {
  switch(name) {
    case "tekla_find_objects": return t.teklaParts(args);
    case "tekla_get_properties": return t.teklaObject(args);
    case "tekla_get_assemblies": return t.teklaAssemblies(args);
    case "tekla_get_rebar": return t.teklaRebar(args);
    case "tekla_get_welds": return t.teklaWelds(args);
    case "tekla_get_bolts": return t.teklaBolts(args);
    case "tekla_create_beam": return t.teklaCreateBeam(args);
    case "tekla_create_column": return t.teklaCreateColumn(args);
    case "tekla_update_object": return t.teklaUpdateObject(args);
    case "tekla_delete_object": return t.teklaDeleteObject(args);
    case "tekla_export_ifc": throw new Error("IFC export worker is not enabled yet.");
    case "tekla_create_drawing": throw new Error("Drawing creation worker is not enabled yet.");
    default: throw new Error(`Unknown Tekla MCP tool: ${name}`);
  }
}
