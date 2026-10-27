/**
 * supraesophageal_ganglion_4_dxf.js
 *
 * DXF JSON -> structural object classifier -> MCP tool payload mapper.
 *
 * Designed for DXF JSON fields such as:
 * Handle, Type, Layer, Material, Elevation_mm, Start_X/Start_Y,
 * End_X/End_Y, Center_X/Center_Y, Radius, Vertices, TeklaPartType,
 * Profile, Length_mm, Width_mm, Depth_mm, etc.
 *
 * Usage:
 *   import {
 *     readDxfJson,
 *     convertDxfJson,
 *     dispatchDxfJson
 *   } from "./supraesophageal_ganglion_4_dxf.js";
 *
 *   const records = await readDxfJson("./dxf-export.json");
 *   const converted = convertDxfJson(records);
 *   console.dir(converted, { depth: null });
 *
 * IMPORTANT:
 * - Configure tool names and argument field names to match your MCP schema.
 * - Geometry is kept in millimetres as supplied by the source JSON.
 * - Missing Z coordinates are not silently invented.
 */

import { readFile } from "node:fs/promises";

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return undefined;
};

const cleanString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const result = String(value).trim();

  return result === "" ? undefined : result;
};

const toNumber = (value) => {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return undefined;
  }

  const n = Number(value);

  return Number.isFinite(n) ? n : undefined;
};

const putIfDefined = (target, key, value) => {
  if (
    value !== undefined &&
    value !== null &&
    value !== ""
  ) {
    target[key] = value;
  }
};

const normalizeToken = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./\\]+/g, " ")
    .replace(/\s+/g, " ");

/**
 * Object type registry.
 *
 * Add or modify entries to support new structural object types.
 *
 * `tool`:
 *   MCP tool name.
 *
 * `aliases`:
 *   Recognized object names and labels.
 *
 * `layerPatterns`:
 *   Regular expressions used to recognize DXF layer names.
 *
 * `partPatterns`:
 *   Regular expressions used to recognize Tekla part types.
 *
 * `fields`:
 *   Maps normalized source values to MCP argument names.
 *
 * NOTE:
 * The tool names and field names below are examples.
 * Match them to the actual definitions in your MCP tools.ts.
 */
export const OBJECT_TYPE_REGISTRY = {
  column: {
    tool: "create_column",

    aliases: [
      "column",
      "columns",
      "coln",
      "col",
      "circular column",
      "rectangular column",
      "tekla column",
      "s coln"
    ],

    layerPatterns: [
      /(^|[^a-z])coln([^a-z]|$)/i,
      /column/i,
      /pillar/i
    ],

    partPatterns: [
      /column/i,
      /circular column/i,
      /rectangular column/i
    ],

    geometry: "vertical",

    fields: {
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      width: "width",
      depth: "depth",
      diameter: "diameter",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      gridLine: "gridLine",
      attributes: "attributes"
    }
  },

  beam: {
    tool: "create_beam",

    aliases: [
      "beam",
      "beams",
      "girder",
      "lintel",
      "header"
    ],

    layerPatterns: [
      /beam/i,
      /girder/i,
      /lintel/i
    ],

    partPatterns: [
      /beam/i,
      /girder/i
    ],

    geometry: "linear",

    fields: {
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      width: "width",
      depth: "depth",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      gridLine: "gridLine",
      attributes: "attributes"
    }
  },

  wall: {
    tool: "create_wall",

    aliases: [
      "wall",
      "walls",
      "shear wall",
      "retaining wall",
      "partition"
    ],

    layerPatterns: [
      /wall/i,
      /shear/i,
      /retaining/i
    ],

    partPatterns: [
      /wall/i
    ],

    geometry: "linear_or_polygon",

    fields: {
      start: "startPoint",
      end: "endPoint",
      vertices: "vertices",
      position: "position",
      length: "length",
      width: "width",
      thickness: "thickness",
      height: "height",
      depth: "depth",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      gridLine: "gridLine",
      attributes: "attributes"
    }
  },

  slab: {
    tool: "create_slab",

    aliases: [
      "slab",
      "floor slab",
      "roof slab",
      "deck",
      "floor",
      "roof"
    ],

    layerPatterns: [
      /slab/i,
      /floor/i,
      /roof/i,
      /deck/i
    ],

    partPatterns: [
      /slab/i,
      /floor/i,
      /roof/i,
      /deck/i
    ],

    geometry: "polygon",

    fields: {
      vertices: "vertices",
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      width: "width",
      thickness: "thickness",
      depth: "depth",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      attributes: "attributes"
    }
  },

  polybeam: {
    tool: "create_polybeam",

    aliases: [
      "polybeam",
      "poly beam",
      "folded plate",
      "foldedplate"
    ],

    layerPatterns: [
      /poly.?beam/i,
      /folded.?plate/i
    ],

    partPatterns: [
      /poly.?beam/i,
      /folded.?plate/i
    ],

    geometry: "polyline",

    fields: {
      vertices: "vertices",
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      width: "width",
      depth: "depth",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      attributes: "attributes"
    }
  },

  footing: {
    tool: "create_footing",

    aliases: [
      "footing",
      "pad footing",
      "strip footing",
      "pile cap",
      "foundation"
    ],

    layerPatterns: [
      /footing/i,
      /foundation/i,
      /pile.?cap/i
    ],

    partPatterns: [
      /footing/i,
      /foundation/i,
      /pile cap/i
    ],

    geometry: "polygon",

    fields: {
      vertices: "vertices",
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      width: "width",
      depth: "depth",
      thickness: "thickness",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      attributes: "attributes"
    }
  },

  pile: {
    tool: "create_pile",

    aliases: [
      "pile",
      "piles",
      "bored pile",
      "driven pile",
      "micropile"
    ],

    layerPatterns: [
      /pile/i
    ],

    partPatterns: [
      /pile/i
    ],

    geometry: "vertical",

    fields: {
      start: "startPoint",
      end: "endPoint",
      position: "position",
      length: "length",
      diameter: "diameter",
      width: "width",
      depth: "depth",
      profile: "profile",
      material: "material",
      class: "class",
      name: "name",
      rotation: "rotation",
      level: "level",
      attributes: "attributes"
    }
  }
};

/**
 * Source JSON field aliases.
 *
 * If your DXF exporter uses different property names,
 * add those names to the corresponding alias arrays.
 */
export const SOURCE_FIELD_ALIASES = {
  handle: [
    "Handle", "handle", "id", "Id", "ID"
  ],

  entityType: [
    "Type", "type", "EntityType", "entityType"
  ],

  layer: [
    "Layer", "layer", "LayerName", "layerName"
  ],

  partType: [
    "TeklaPartType",
    "teklaPartType",
    "PartType",
    "partType",
    "ObjectType"
  ],

  material: [
    "Material", "material", "Grade", "grade"
  ],

  profile: [
    "Profile", "profile", "Section", "section"
  ],

  class: [
    "Class", "class", "ObjectClass", "objectClass"
  ],

  name: [
    "Name",
    "name",
    "PartName",
    "partName",
    "Text",
    "text"
  ],

  startX: [
    "Start_X", "StartX", "startX", "X1", "x1"
  ],

  startY: [
    "Start_Y", "StartY", "startY", "Y1", "y1"
  ],

  startZ: [
    "Start_Z",
    "StartZ",
    "startZ",
    "Z1",
    "z1",
    "StartElevation_mm"
  ],

  endX: [
    "End_X", "EndX", "endX", "X2", "x2"
  ],

  endY: [
    "End_Y", "EndY", "endY", "Y2", "y2"
  ],

  endZ: [
    "End_Z",
    "EndZ",
    "endZ",
    "Z2",
    "z2",
    "EndElevation_mm"
  ],

  centerX: [
    "Center_X", "CenterX", "centerX", "CenterX_mm"
  ],

  centerY: [
    "Center_Y", "CenterY", "centerY", "CenterY_mm"
  ],

  centerZ: [
    "Center_Z", "CenterZ", "centerZ", "CenterZ_mm"
  ],

  elevation: [
    "Elevation_mm",
    "Elevation",
    "elevation",
    "Level",
    "level",
    "Z",
    "z"
  ],

  radius: [
    "Radius", "radius"
  ],

  length: [
    "Length_mm", "Length", "length", "Length_m"
  ],

  width: [
    "Width_mm", "Width", "width", "Width_m"
  ],

  depth: [
    "Depth_mm", "Depth", "depth", "Depth_m"
  ],

  thickness: [
    "Thickness_mm",
    "Thickness",
    "thickness",
    "PlateThickness"
  ],

  height: [
    "Height_mm", "Height", "height"
  ],

  diameter: [
    "Diameter_mm", "Diameter", "diameter"
  ],

  gridLine: [
    "GridLine", "Gridline", "gridLine", "Grid", "grid"
  ],

  rotation: [
    "Rotation", "rotation", "Angle", "angle"
  ],

  vertices: [
    "Vertices",
    "vertices",
    "Points",
    "points",
    "Coordinates",
    "coordinates"
  ],

  closed: [
    "Closed", "closed"
  ],

  vertexCount: [
    "VertexCount", "vertexCount"
  ],

  pattern: [
    "Pattern", "pattern"
  ]
};

function readSource(record, logicalName) {
  const aliases =
    SOURCE_FIELD_ALIASES[logicalName] ?? [logicalName];

  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const value = record[key];

      if (
        value !== undefined &&
        value !== null &&
        String(value).trim() !== ""
      ) {
        return value;
      }
    }
  }

  return undefined;
}

function parseVertices(value) {
  if (Array.isArray(value)) {
    return value.map(parsePoint).filter(Boolean);
  }

  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  // Supports:
  // "(x,y)", "(x,y,z)", "x,y,z; x,y,z", and similar formats.
  const matches = [
    ...value.matchAll(
      /\(?\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)(?:\s*[,; ]\s*(-?\d+(?:\.\d+)?))?\s*\)?/g
    )
  ];

  return matches.map((m) => {
    const point = {
      x: Number(m[1]),
      y: Number(m[2])
    };

    if (m[3] !== undefined) {
      point.z = Number(m[3]);
    }

    return point;
  });
}

function parsePoint(value) {
  if (Array.isArray(value)) {
    if (value.length < 2) {
      return undefined;
    }

    const point = {
      x: toNumber(value[0]),
      y: toNumber(value[1])
    };

    if (value.length > 2) {
      point.z = toNumber(value[2]);
    }

    if (
      point.x === undefined ||
      point.y === undefined
    ) {
      return undefined;
    }

    if (point.z === undefined) {
      delete point.z;
    }

    return point;
  }

  if (isObject(value)) {
    const point = {
      x: toNumber(
        firstNonEmpty(value.x, value.X, value.X_mm)
      ),

      y: toNumber(
        firstNonEmpty(value.y, value.Y, value.Y_mm)
      ),

      z: toNumber(
        firstNonEmpty(value.z, value.Z, value.Z_mm)
      )
    };

    if (
      point.x === undefined ||
      point.y === undefined
    ) {
      return undefined;
    }

    if (point.z === undefined) {
      delete point.z;
    }

    return point;
  }

  return undefined;
}

function getPoint(record, prefix) {
  const x = toNumber(
    readSource(record, `${prefix}X`)
  );

  const y = toNumber(
    readSource(record, `${prefix}Y`)
  );

  const z = toNumber(
    readSource(record, `${prefix}Z`)
  );

  if (x === undefined || y === undefined) {
    return undefined;
  }

  const point = { x, y };

  if (z !== undefined) {
    point.z = z;
  }

  return point;
}

function extractGeometry(record) {
  const start = getPoint(record, "start");
  const end = getPoint(record, "end");

  const centerX = toNumber(
    readSource(record, "centerX")
  );

  const centerY = toNumber(
    readSource(record, "centerY")
  );

  const centerZ = toNumber(
    readSource(record, "centerZ")
  );

  const elevation = toNumber(
    readSource(record, "elevation")
  );

  const radius = toNumber(
    readSource(record, "radius")
  );

  const vertices = parseVertices(
    readSource(record, "vertices")
  );

  const center =
    centerX !== undefined && centerY !== undefined
      ? {
          x: centerX,
          y: centerY,
          ...(centerZ !== undefined
            ? { z: centerZ }
            : {})
        }
      : undefined;

  // Apply an explicit elevation as Z only when the point
  // does not already contain a Z coordinate.
  const applyElevation = (point) => {
    if (!point) {
      return undefined;
    }

    if (
      point.z === undefined &&
      elevation !== undefined
    ) {
      return {
        ...point,
        z: elevation
      };
    }

    return point;
  };

  return {
    start: applyElevation(start),
    end: applyElevation(end),
    center: applyElevation(center),
    radius,
    vertices: vertices.map(applyElevation),
    elevation
  };
}

function classifyByRegistryText(
  text,
  registry,
  source = ""
) {
  const raw = String(text ?? "").trim();
  const normalized = normalizeToken(raw);

  if (!normalized) {
    return undefined;
  }

  for (const [type, config] of Object.entries(registry)) {
    // Use regular expressions for layer names and part labels.
    const patterns =
      source === "layer"
        ? config.layerPatterns
        : source === "partType"
          ? config.partPatterns
          : undefined;

    if (
      patterns?.some(
        (pattern) =>
          pattern.test(raw) ||
          pattern.test(normalized)
      )
    ) {
      return type;
    }

    if (
      config.aliases?.some(
        (alias) =>
          normalized.includes(normalizeToken(alias))
      )
    ) {
      return type;
    }
  }

  return undefined;
}

/**
 * Classifies a DXF entity.
 *
 * Priority:
 * 1. Explicit structural object type
 * 2. Tekla part type
 * 3. DXF layer
 * 4. Name/text
 *
 * HATCH entities are ignored by default because they
 * usually represent drafting fills rather than parts.
 */
export function classifyDxfEntity(record, options = {}) {
  const registry =
    options.registry ?? OBJECT_TYPE_REGISTRY;

  const entityType = String(
    readSource(record, "entityType") ?? ""
  ).toUpperCase();

  if (
    entityType === "HATCH" &&
    options.includeHatches !== true
  ) {
    return {
      objectType: "ignored",
      reason: "HATCH is drafting graphics by default"
    };
  }

  const partType = cleanString(
    readSource(record, "partType")
  );

  const layer = cleanString(
    readSource(record, "layer")
  );

  const explicitType = cleanString(
    firstNonEmpty(
      record.ObjectType,
      record.objectType,
      record.StructuralType,
      record.structuralType,
      record.Category,
      record.category
    )
  );

  const nameOrText = cleanString(
    readSource(record, "name")
  );

  const candidates = [
    {
      value: explicitType,
      source: "explicitType"
    },
    {
      value: partType,
      source: "partType"
    },
    {
      value: layer,
      source: "layer"
    },
    {
      value: nameOrText,
      source: "nameOrText"
    }
  ];

  for (const candidate of candidates) {
    const found = classifyByRegistryText(
      candidate.value,
      registry,
      candidate.source
    );

    if (found) {
      return {
        objectType: found,
        matchedBy: candidate.source,
        matchedValue: candidate.value
      };
    }
  }

  // A circle could represent a pile, column, hole,
  // or drawing symbol. Do not guess without a rule.
  if (entityType === "CIRCLE") {
    const radius = toNumber(
      readSource(record, "radius")
    );

    if (radius !== undefined) {
      return {
        objectType: "unknown",
        reason:
          "Circle geometry could represent a column, pile, hole, or symbol; add a layer/part-type rule",
        geometryHint: "circle"
      };
    }
  }

  return {
    objectType: "unknown",
    reason: "No matching structural type rule",
    geometryHint: entityType || undefined
  };
}

function normalizedRecord(record) {
  const geometry = extractGeometry(record);
  const radius = geometry.radius;

  const dimensions = {
    length: toNumber(
      readSource(record, "length")
    ),

    width: toNumber(
      readSource(record, "width")
    ),

    depth: toNumber(
      readSource(record, "depth")
    ),

    thickness: toNumber(
      readSource(record, "thickness")
    ),

    height: toNumber(
      readSource(record, "height")
    ),

    diameter:
      toNumber(readSource(record, "diameter")) ??
      (radius !== undefined ? radius * 2 : undefined)
  };

  return {
    handle: cleanString(
      readSource(record, "handle")
    ),

    dxfEntityType: cleanString(
      readSource(record, "entityType")
    ),

    layer: cleanString(
      readSource(record, "layer")
    ),

    teklaPartType: cleanString(
      readSource(record, "partType")
    ),

    name: cleanString(
      readSource(record, "name")
    ),

    material: cleanString(
      readSource(record, "material")
    ),

    profile: cleanString(
      readSource(record, "profile")
    ),

    class: cleanString(
      readSource(record, "class")
    ),

    gridLine: cleanString(
      readSource(record, "gridLine")
    ),

    rotation: toNumber(
      readSource(record, "rotation")
    ),

    pattern: cleanString(
      readSource(record, "pattern")
    ),

    closed: cleanString(
      readSource(record, "closed")
    ),

    vertexCount: toNumber(
      readSource(record, "vertexCount")
    ),

    elevation: geometry.elevation,
    start: geometry.start,
    end: geometry.end,
    center: geometry.center,
    vertices: geometry.vertices,
    radius,
    dimensions,
    source: record
  };
}

function defaultPosition(normalized, objectType) {
  // Circular/point objects generally use their center.
  // Change this if your MCP schema expects another format.
  if (
    normalized.center &&
    ["column", "pile"].includes(objectType)
  ) {
    return normalized.center;
  }

  if (normalized.start) {
    return normalized.start;
  }

  if (normalized.vertices?.length) {
    const points = normalized.vertices;

    const sum = points.reduce(
      (acc, p) => ({
        x: acc.x + p.x,
        y: acc.y + p.y,
        z: acc.z + (p.z ?? 0)
      }),
      { x: 0, y: 0, z: 0 }
    );

    const center = {
      x: sum.x / points.length,
      y: sum.y / points.length
    };

    if (points.some((p) => p.z !== undefined)) {
      center.z = sum.z / points.length;
    }

    return center;
  }

  return normalized.center;
}

function makeAttributes(normalized) {
  const attributes = {};

  putIfDefined(
    attributes,
    "dxfHandle",
    normalized.handle
  );

  putIfDefined(
    attributes,
    "dxfEntityType",
    normalized.dxfEntityType
  );

  putIfDefined(
    attributes,
    "layer",
    normalized.layer
  );

  putIfDefined(
    attributes,
    "teklaPartType",
    normalized.teklaPartType
  );

  putIfDefined(
    attributes,
    "gridLine",
    normalized.gridLine
  );

  putIfDefined(
    attributes,
    "elevation",
    normalized.elevation
  );

  putIfDefined(
    attributes,
    "rotation",
    normalized.rotation
  );

  putIfDefined(
    attributes,
    "pattern",
    normalized.pattern
  );

  putIfDefined(
    attributes,
    "closed",
    normalized.closed
  );

  putIfDefined(
    attributes,
    "vertexCount",
    normalized.vertexCount
  );

  putIfDefined(
    attributes,
    "radius",
    normalized.radius
  );

  return attributes;
}

/**
 * Maps one DXF entity into an MCP tool call.
 *
 * Options:
 *   registry:
 *     Alternative object type registry.
 *
 *   fieldOverrides:
 *     Per-object-type overrides for MCP argument names.
 */
export function mapDxfEntityToMcp(
  record,
  options = {}
) {
  const registry =
    options.registry ?? OBJECT_TYPE_REGISTRY;

  const classification = classifyDxfEntity(
    record,
    {
      ...options,
      registry
    }
  );

  if (
    classification.objectType === "unknown" ||
    classification.objectType === "ignored"
  ) {
    return {
      ok: false,
      handle: cleanString(
        readSource(record, "handle")
      ),
      classification,
      source: record
    };
  }

  const config = registry[classification.objectType];
  const normalized = normalizedRecord(record);

  const fieldMap = {
    ...config.fields,
    ...(options.fieldOverrides?.[
      classification.objectType
    ] ?? {})
  };

  const position = defaultPosition(
    normalized,
    classification.objectType
  );

  const sourceValues = {
    start: normalized.start,
    end: normalized.end,
    position,

    vertices: normalized.vertices.length
      ? normalized.vertices
      : undefined,

    length: normalized.dimensions.length,
    width: normalized.dimensions.width,
    depth: normalized.dimensions.depth,
    thickness: normalized.dimensions.thickness,
    height: normalized.dimensions.height,
    diameter: normalized.dimensions.diameter,

    profile: normalized.profile,
    material: normalized.material,
    class: normalized.class,
    name: normalized.name,
    rotation: normalized.rotation,
    level: normalized.elevation,
    gridLine: normalized.gridLine,
    attributes: makeAttributes(normalized)
  };

  const args = {};

  for (const [logicalName, targetName] of
    Object.entries(fieldMap)) {
    if (!targetName) {
      continue;
    }

    const value = sourceValues[logicalName];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      args[targetName] = value;
    }
  }

  // Preserve source dimensions and coordinates in attributes
  // so that useful data is not lost during conversion.
  if (
    fieldMap.attributes &&
    args[fieldMap.attributes]
  ) {
    const a = args[fieldMap.attributes];

    putIfDefined(
      a,
      "sourceLength",
      normalized.dimensions.length
    );

    putIfDefined(
      a,
      "sourceWidth",
      normalized.dimensions.width
    );

    putIfDefined(
      a,
      "sourceDepth",
      normalized.dimensions.depth
    );

    putIfDefined(
      a,
      "sourceThickness",
      normalized.dimensions.thickness
    );

    putIfDefined(
      a,
      "sourceHeight",
      normalized.dimensions.height
    );

    putIfDefined(
      a,
      "sourceDiameter",
      normalized.dimensions.diameter
    );

    if (normalized.start) {
      a.startPoint = normalized.start;
    }

    if (normalized.end) {
      a.endPoint = normalized.end;
    }

    if (normalized.center) {
      a.centerPoint = normalized.center;
    }

    if (normalized.vertices.length) {
      a.vertices = normalized.vertices;
    }
  }

  return {
    ok: true,
    handle: normalized.handle,
    objectType: classification.objectType,
    matchedBy: classification.matchedBy,
    tool: config.tool,
    args,
    classification,
    source: record
  };
}

/**
 * Accepts either a parsed JSON value or a JSON string.
 *
 * Supported inputs:
 * - An array of entity objects
 * - { entities: [...] }
 * - { objects: [...] }
 * - { data: [...] }
 * - { features: [...] }
 * - A single entity object
 */
export function parseDxfJson(input) {
  const parsed =
    typeof input === "string"
      ? JSON.parse(input)
      : input;

  if (Array.isArray(parsed)) {
    return parsed.filter(isObject);
  }

  if (isObject(parsed)) {
    const collectionKeys = [
      "entities",
      "Entities",
      "objects",
      "Objects",
      "data",
      "Data",
      "features",
      "Features"
    ];

    for (const key of collectionKeys) {
      if (Array.isArray(parsed[key])) {
        return parsed[key].filter(isObject);
      }
    }

    return [parsed];
  }

  throw new TypeError(
    "DXF JSON must be an object or an array of objects."
  );
}

/**
 * Reads and parses a DXF JSON file.
 */
export async function readDxfJson(filePath) {
  const contents = await readFile(filePath, "utf8");

  return parseDxfJson(contents);
}

/**
 * Converts all records.
 *
 * Unknown and ignored records are returned separately
 * for inspection and classification-rule improvements.
 */
export function convertDxfJson(input, options = {}) {
  const records = parseDxfJson(input);

  const calls = [];
  const skipped = [];
  const counts = {};

  for (const record of records) {
    const result = mapDxfEntityToMcp(
      record,
      options
    );

    const key =
      result.objectType ??
      result.classification?.objectType ??
      "unknown";

    counts[key] = (counts[key] ?? 0) + 1;

    if (result.ok) {
      calls.push(result);
    } else {
      skipped.push(result);
    }
  }

  return {
    totalRecords: records.length,
    mappedCount: calls.length,
    skippedCount: skipped.length,
    counts,
    calls,
    skipped
  };
}

/**
 * Sends converted records to a caller-supplied MCP function.
 *
 * Example:
 *   await dispatchDxfJson(
 *     records,
 *     async (toolName, args) =>
 *       callMcpTool(toolName, args),
 *     { dryRun: true }
 *   );
 *
 * Dry-run is enabled by default.
 *
 * Set { dryRun: false } only after validating the mapped
 * arguments against your actual MCP tool schemas.
 */
export async function dispatchDxfJson(
  input,
  callMcp,
  options = {}
) {
  if (typeof callMcp !== "function") {
    throw new TypeError(
      "dispatchDxfJson requires callMcp(toolName, args)."
    );
  }

  const converted = convertDxfJson(
    input,
    options
  );

  const dryRun = options.dryRun !== false;
  const results = [];

  for (const item of converted.calls) {
    if (dryRun) {
      results.push({
        handle: item.handle,
        objectType: item.objectType,
        tool: item.tool,
        args: item.args,
        dryRun: true
      });

      continue;
    }

    try {
      const response = await callMcp(
        item.tool,
        item.args
      );

      results.push({
        handle: item.handle,
        objectType: item.objectType,
        tool: item.tool,
        ok: true,
        response
      });
    } catch (error) {
      results.push({
        handle: item.handle,
        objectType: item.objectType,
        tool: item.tool,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : String(error)
      });

      if (options.stopOnError === true) {
        break;
      }
    }
  }

  return {
    ...converted,
    dryRun,
    dispatchResults: results
  };
}

/**
 * Prints a compact conversion report.
 */
export function formatDxfReport(result) {
  const lines = [
    `DXF records: ${result.totalRecords}`,
    `Mapped: ${result.mappedCount}`,
    `Skipped/unknown: ${result.skippedCount}`,
    "Type counts:"
  ];

  for (const [type, count] of
    Object.entries(result.counts ?? {})) {
    lines.push(`  ${type}: ${count}`);
  }

  if (result.skipped?.length) {
    lines.push("Skipped examples:");

    for (const item of result.skipped.slice(0, 20)) {
      lines.push(
        `  handle=${item.handle ?? "?"}: ` +
        `${item.classification?.reason ?? "unmapped"}`
      );
    }
  }

  return lines.join("\n");
}

/**
 * Default module export.
 */
export default {
  OBJECT_TYPE_REGISTRY,
  SOURCE_FIELD_ALIASES,
  parseDxfJson,
  readDxfJson,
  classifyDxfEntity,
  mapDxfEntityToMcp,
  convertDxfJson,
  dispatchDxfJson,
  formatDxfReport
};