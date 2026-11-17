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

export function extractGridlineData(input) {
  return parseDxfJson(input)
    .filter(record => /^S-_ANOTGRID_(E2?|T2?)$/i.test(String(readSource(record, "layer") ?? "").trim()))
    .map(record => {
      const normalized = normalizedRecord(record);
      return {
        type: "gridline",
        handle: normalized.handle,
        layer: normalized.layer,
        entityType: normalized.dxfEntityType,
        label: normalized.name,
        startPoint: normalized.start,
        endPoint: normalized.end,
        center: normalized.center,
        vertices: normalized.vertices,
        radius: /^(CIRCLE|ARC)$/i.test(normalized.dxfEntityType ?? "") ? toNumber(readSource(record, "radius")) : undefined,
        startAngle: toNumber(record.StartAngle ?? record.startAngle),
        endAngle: toNumber(record.EndAngle ?? record.endAngle),
        source: record
      };
    });
}

// A parent grid represents straight, axis-aligned lines with common rectangular extents.
export function buildGridDefinition(entities) {
  const tolerance = 0.01;
  const skipped = [];
  const used = new Set();
  const skip = (entity, reason) => skipped.push({ handle: entity.handle, type: "gridline", entityType: entity.entityType, reason });
  const circles = entities.filter(e => e.entityType === "CIRCLE" && e.center && e.radius > 0);
  const texts = entities.filter(e => e.entityType === "TEXT" && e.startPoint && e.label);
  const segments = [];
  for (const entity of entities) {
    if (entity.entityType !== "LINE") continue;
    const a = entity.startPoint, b = entity.endPoint;
    if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) {
      skip(entity, "line has invalid endpoints");
      continue;
    }
    const za = a.z ?? 0, zb = b.z ?? 0;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
    if (!Number.isFinite(za) || !Number.isFinite(zb) ||
        Math.abs(za - zb) > tolerance || (dx <= tolerance && dy <= tolerance)) {
      skip(entity, "line is non-planar or has zero length");
      continue;
    }
    if (dx > tolerance && dy > tolerance) {
      skip(entity, "diagonal grid line is unsupported");
      continue;
    }
    const axis = dx <= tolerance ? "x" : "y";
    const coordinate = axis === "x" ? (a.x + b.x) / 2 : (a.y + b.y) / 2;
    const ends = axis === "x" ? [a.y, b.y] : [a.x, b.x];
    segments.push({ entity, axis, coordinate, z: (za + zb) / 2, min: Math.min(...ends), max: Math.max(...ends) });
  }
  const groups = [];
  for (const segment of segments) {
    let group = groups.find(g => g.axis === segment.axis &&
      Math.abs(g.coordinate - segment.coordinate) <= tolerance && Math.abs(g.z - segment.z) <= tolerance);
    if (!group) {
      group = { axis: segment.axis, coordinate: segment.coordinate, z: segment.z, segments: [] };
      groups.push(group);
    }
    if (group.segments.some(other => Math.abs(other.min - segment.min) <= tolerance && Math.abs(other.max - segment.max) <= tolerance)) {
      skip(segment.entity, "duplicate grid line");
      continue;
    }
    group.segments.push(segment);
  }
  const lines = [];
  for (const group of groups) {
    group.segments.sort((a, b) => a.min - b.min);
    let min = group.segments[0].min, max = group.segments[0].max, disconnected = false;
    for (const segment of group.segments.slice(1)) {
      if (segment.min > max + tolerance) disconnected = true;
      max = Math.max(max, segment.max);
    }
    if (disconnected) {
      for (const segment of group.segments) skip(segment.entity, "disconnected collinear fragments cannot be represented safely");
      continue;
    }
    const matches = [];
    for (const circle of circles) {
      const perpendicular = group.axis === "x" ? circle.center.x : circle.center.y;
      const along = group.axis === "x" ? circle.center.y : circle.center.x;
      const distance = Math.min(Math.abs(along - min), Math.abs(along - max));
      const nearEnd = Math.abs(distance - circle.radius) <= Math.max(tolerance, circle.radius * 0.1);
      if (!nearEnd || Math.abs(perpendicular - group.coordinate) > circle.radius * 0.1 ||
          Math.abs((circle.center.z ?? 0) - group.z) > tolerance) continue;
      const inBubble = texts.filter(text =>
        Math.hypot(text.startPoint.x - circle.center.x, text.startPoint.y - circle.center.y) <= circle.radius &&
        Math.abs((text.startPoint.z ?? 0) - group.z) <= tolerance);
      for (const text of inBubble) matches.push({ circle, text, label: String(text.label).trim() });
    }
    for (const text of texts) {
      if (matches.some(match => match.text === text)) continue;
      const height = toNumber(text.source?.Radius ?? text.source?.height);
      if (!height || height <= 0 || Math.abs((text.startPoint.z ?? 0) - group.z) > tolerance) continue;
      const perpendicular = group.axis === "x" ? text.startPoint.x : text.startPoint.y;
      const along = group.axis === "x" ? text.startPoint.y : text.startPoint.x;
      if (Math.abs(perpendicular - group.coordinate) <= height &&
          Math.min(Math.abs(along - min), Math.abs(along - max)) <= height * 2) {
        matches.push({ text, label: String(text.label).trim() });
      }
    }
    const labels = [...new Set(matches.map(m => m.label))];
    if (labels.length !== 1 || /\s/.test(labels[0])) {
      for (const segment of group.segments) skip(segment.entity, labels.length ? "ambiguous grid labels" : "no matching grid label");
      continue;
    }
    lines.push({ ...group, min, max, label: labels[0], matches });
  }
  const ambiguous = new Set();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if ((lines[i].axis === lines[j].axis && lines[i].label === lines[j].label) ||
          lines[i].matches.some(a => lines[j].matches.some(b => (a.circle && a.circle === b.circle) || a.text === b.text))) {
        ambiguous.add(lines[i]);
        ambiguous.add(lines[j]);
      }
    }
  }
  for (const line of ambiguous) {
    for (const segment of line.segments) skip(segment.entity, "grid label is associated with multiple lines");
  }
  const accepted = lines.filter(line => !ambiguous.has(line));
  const x = accepted.filter(line => line.axis === "x").sort((a, b) => a.coordinate - b.coordinate);
  const y = accepted.filter(line => line.axis === "y").sort((a, b) => a.coordinate - b.coordinate);
  const samePlane = accepted.every(line => Math.abs(line.z - accepted[0].z) <= tolerance);
  if (!x.length || !y.length || !samePlane) {
    for (const line of accepted) for (const segment of line.segments) {
      skip(segment.entity, !samePlane ? "grid lines have different elevations" : "both X and Y grid lines are required");
    }
  } else {
    for (const line of accepted) {
      for (const segment of line.segments) used.add(segment.entity);
      for (const match of line.matches) { if (match.circle) used.add(match.circle); used.add(match.text); }
    }
  }
  for (const entity of entities) {
    if (entity.entityType === "LINE" || used.has(entity)) continue;
    skip(entity, entity.entityType === "ARC" ? "curved grid lines are unsupported by the parent grid tool" :
      entity.entityType === "CIRCLE" || entity.entityType === "TEXT" ? "annotation not associated with a created grid line" :
      "unsupported grid entity");
  }
  if (!x.length || !y.length || !samePlane) return { grid: null, skipped };
  const format = value => String(Number(value.toFixed(6)));
  const spacings = lines => lines.map((line, i) => format(i ? line.coordinate - lines[i - 1].coordinate : 0));
  const grid = {
    origin: { x: x[0].coordinate, y: y[0].coordinate, z: x[0].z },
    coordinateX: spacings(x), coordinateY: spacings(y),
    labelX: x.map(line => line.label), labelY: y.map(line => line.label),
    extensionLeft: Math.max(0, x[0].coordinate - Math.min(...y.map(line => line.min))),
    extensionRight: Math.max(0, Math.max(...y.map(line => line.max)) - x[x.length - 1].coordinate),
    extensionBelow: Math.max(0, y[0].coordinate - Math.min(...x.map(line => line.min))),
    extensionAbove: Math.max(0, Math.max(...x.map(line => line.max)) - y[y.length - 1].coordinate)
  };
  return { grid, skipped };
}
/**
 * Converts structural records; unknown and ignored records are returned separately.
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

/* ------------------------------------------------------------------ */
/* Structural beam and wall filtering                                  */
/* ------------------------------------------------------------------ */

/**
 * Grid bubbles, dimensions and title blocks are drawn as
 * circles/lines but are not structural members.
 *
 * Layers ending in _T / _T2 are tag layers (labels and leader
 * lines), e.g. S-_WALL----_T. Closed outlines there are kept
 * because slab outlines are drawn on S-_SLAB----_T.
 */
export const ANNOTATION_LAYER_PATTERN =
  /anot|grid|dim|tblk|title|text|note/i;

export const TAG_LAYER_PATTERN = /_t\d?$/i;

/**
 * Returns a skip reason when the source record is annotation
 * graphics (tags, dimensions, labels), or null when the record
 * describes a real structural member.
 */
export function annotationSkipReason(source) {
  const layer = String(source?.Layer ?? "");

  const closedOutline =
    /POLYLINE/i.test(String(source?.Type ?? "")) &&
    /^(yes|true|1)$/i.test(String(source?.Closed ?? ""));

  if (
    ANNOTATION_LAYER_PATTERN.test(layer) ||
    (TAG_LAYER_PATTERN.test(layer) && !closedOutline)
  ) {
    return `annotation layer ${layer}`;
  }

  return null;
}

/**
 * Same type at the same place counts once, even if drawn with
 * different shapes (e.g. circle + outline). Profile, material
 * and class do not affect placement, so they are excluded.
 */
export function duplicateCallKey(type, tool, args) {
  const { profile, material, classNumber, ...place } = args ?? {};

  return JSON.stringify(
    [type, tool, place],
    (_, value) =>
      typeof value === "number" ? Math.round(value) : value
  );
}

/**
 * Samples a DXF ARC in its XY plane as one polybeam contour.
 * Angles are degrees, counterclockwise, with at most 1 mm chord deviation.
 */
export function beamArcPoints(source, zFallback = 0) {
  const center = getPoint(source, "center");
  const radius = toNumber(readSource(source, "radius"));
  const start = toNumber(source.StartAngle ?? source.startAngle);
  const end = toNumber(source.EndAngle ?? source.endAngle);
  if (!center || !(radius > 0) || start === undefined || end === undefined) {
    throw new Error("curved beam needs center, positive radius, StartAngle and EndAngle");
  }
  const sweep = ((end - start) % 360 + 360) % 360;
  if (!sweep) throw new Error("curved beam has zero angular sweep");
  const radians = sweep * Math.PI / 180;
  const step = Math.min(Math.PI / 36, 2 * Math.acos(Math.max(-1, 1 - 1 / radius)));
  const segments = Math.max(2, Math.ceil(radians / step));
  if (!Number.isFinite(segments) || segments > 10000) {
    throw new Error("curved beam requires too many contour points at 1 mm tolerance");
  }
  const z = center.z ?? toNumber(readSource(source, "elevation")) ?? zFallback;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start * Math.PI / 180 + radians * index / segments;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z };
  });
}

export function beamCallRejection(call) {
  if (!["tekla_create_beam", "tekla_create_polybeam"].includes(call?.tool)) {
    return `tool ${call?.tool ?? "none"} is not a beam`;
  }
  if (call.type !== undefined && !["beam", "polybeam"].includes(call.type)) {
    return `type ${call.type} is not a beam`;
  }
  const args = call.arguments ?? {};
  const points = call.tool === "tekla_create_polybeam"
    ? args.points
    : [{ x: args.x1, y: args.y1, z: args.z1 }, { x: args.x2, y: args.y2, z: args.z2 }];
  if (!Array.isArray(points) || points.length < 2) return "beam needs at least 2 points";
  for (const point of points) {
    if (!point || ["x", "y", "z"].some((axis) => toNumber(point[axis]) === undefined)) {
      return "beam point coordinates must be finite numbers";
    }
  }
  for (let index = 1; index < points.length; index += 1) {
    if (["x", "y", "z"].every((axis) => Number(points[index][axis]) === Number(points[index - 1][axis]))) {
      return "beam has a zero-length segment";
    }
  }
  return null;
}

/**
 * Accepts a mapped result or calls array; never deletes existing model objects.
 * Rejected calls retain their handle, type and an explicit removal reason.
 */
export function filterBeamCalls(result) {
  const calls = [];
  const removed = [];
  const seen = new Set();
  for (const call of Array.isArray(result) ? result : result?.calls ?? []) {
    const reason = beamCallRejection(call);
    const key = reason ? null : duplicateCallKey("beam", call.tool, call.arguments);
    if (reason || seen.has(key)) {
      removed.push({ handle: call?.handle, type: call?.type, reason: reason || "duplicate of an earlier object" });
      continue;
    }
    seen.add(key);
    calls.push(call);
  }
  return { calls, removed };
}

/**
 * Returns a removal reason when a mapped call is not a genuine
 * wall, or null when it is one.
 *
 * A genuine wall call is a tekla_create_wall contour with
 * numeric corners, a non-zero base run (point1 to point2) and a
 * non-zero height (point2 up to point3).
 */
export function wallCallRejection(call) {
  if (call?.tool !== "tekla_create_wall") {
    return `tool ${call?.tool ?? "none"} is not a wall`;
  }

  if (call.type !== undefined && call.type !== "wall") {
    return `type ${call.type} is not a wall`;
  }

  const args = call.arguments ?? {};

  const corners = [
    "x1", "y1", "z1",
    "x2", "y2", "z2",
    "x3", "y3", "z3"
  ];

  if (
    args.x4 !== undefined ||
    args.y4 !== undefined ||
    args.z4 !== undefined
  ) {
    corners.push("x4", "y4", "z4");
  }

  for (const key of corners) {
    if (!Number.isFinite(Number(args[key]))) {
      return `corner value ${key} is not a number`;
    }
  }

  const run = Math.hypot(
    Number(args.x2) - Number(args.x1),
    Number(args.y2) - Number(args.y1)
  );

  if (!(run > 0)) {
    return "wall base has zero length";
  }

  const rise = Math.abs(Number(args.z3) - Number(args.z2));

  if (!(rise > 0)) {
    return "wall has zero height";
  }

  return null;
}

/**
 * A wall is drawn in plan as a thin rectangle outline. The outline
 * may be closed, or open with the closing edge left undrawn (three
 * edges: short-long-short or long-short-long).
 *
 * Returns the one wall that outline represents as
 * { start, end, length, thickness } along the centreline of the
 * long axis, or null when the points do not outline a rectangle.
 *
 * Set requireRectangle: false to collapse any 4-point outline
 * without validating right angles (used for explicitly closed
 * outlines, which are trusted as drawn).
 */
export function wallOutlineCentreline(points, options = {}) {
  const tolerance = options.tolerance ?? 1;
  const requireRectangle = options.requireRectangle ?? true;

  const pts = [];

  for (const point of points ?? []) {
    const x = Number(point?.x);
    const y = Number(point?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const next = { x, y, z: Number(point?.z ?? 0) || 0 };
    const previous = pts[pts.length - 1];

    if (
      !previous ||
      Math.hypot(next.x - previous.x, next.y - previous.y) > tolerance
    ) {
      pts.push(next);
    }
  }

  if (
    pts.length === 5 &&
    Math.hypot(
      pts[4].x - pts[0].x,
      pts[4].y - pts[0].y
    ) <= tolerance
  ) {
    pts.pop();
  }

  if (pts.length !== 4) {
    return null;
  }

  const [p0, p1, p2, p3] = pts;

  const edge01 = { x: p1.x - p0.x, y: p1.y - p0.y };
  const edge12 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const edge32 = { x: p2.x - p3.x, y: p2.y - p3.y };

  const d01 = Math.hypot(edge01.x, edge01.y);
  const d12 = Math.hypot(edge12.x, edge12.y);

  if (!(d01 > 0) || !(d12 > 0)) {
    return null;
  }

  if (requireRectangle) {
    // Opposite edges equal (parallelogram) and adjacent edges
    // perpendicular (rectangle), whether or not the closing edge
    // p3 -> p0 was drawn.
    if (
      Math.abs(edge01.x - edge32.x) > tolerance ||
      Math.abs(edge01.y - edge32.y) > tolerance
    ) {
      return null;
    }

    const dot = edge01.x * edge12.x + edge01.y * edge12.y;

    if (Math.abs(dot) > tolerance * Math.max(d01, d12)) {
      return null;
    }
  }

  const mid = (a, b) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z
  });

  return d01 >= d12
    ? {
        start: mid(p0, p3),
        end: mid(p1, p2),
        length: d01,
        thickness: d12
      }
    : {
        start: mid(p0, p1),
        end: mid(p3, p2),
        length: d12,
        thickness: d01
      };
}

function wallBasePoint(args, index) {
  return {
    x: Number(args?.["x" + index]),
    y: Number(args?.["y" + index]),
    z: Number(args?.["z" + index]) || 0
  };
}

/**
 * Consecutive wall calls from one source handle whose base
 * segments chain into a thin-rectangle outline are the drawn
 * edges of ONE wall, not one wall each. Returns the single
 * centreline wall call, or null when the group is not such an
 * outline.
 */
function collapseWallOutlineChain(group, tolerance = 1) {
  if (group.length < 2) {
    return null;
  }

  const pts = [wallBasePoint(group[0].arguments, 1)];

  for (const call of group) {
    const start = wallBasePoint(call.arguments, 1);
    const previous = pts[pts.length - 1];

    if (
      Math.hypot(
        start.x - previous.x,
        start.y - previous.y
      ) > tolerance
    ) {
      return null;
    }

    pts.push(wallBasePoint(call.arguments, 2));
  }

  const outline = wallOutlineCentreline(pts, { tolerance });

  if (!outline) {
    return null;
  }

  const template = group[0];
  const args = template.arguments;
  const height = Math.abs(Number(args.z3) - Number(args.z2));

  if (!(height > 0)) {
    return null;
  }

  const { start, end } = outline;

  return {
    ...template,
    arguments: {
      ...args,
      x1: start.x, y1: start.y, z1: start.z,
      x2: end.x, y2: end.y, z2: end.z,
      x3: end.x, y3: end.y, z3: end.z + height,
      x4: start.x, y4: start.y, z4: start.z + height
    }
  };
}

/**
 * Keeps only genuine wall creation calls from a brain conversion
 * result and removes everything that is not a wall (other tools,
 * degenerate contours, and duplicates).
 *
 * Consecutive calls from the same handle whose segments outline a
 * thin rectangle in plan are collapsed into the one wall they
 * draw (its long-axis centreline), so an outline drawn as three
 * or four edges counts as one wall.
 *
 * Accepts the full result object ({ calls: [...] }) or a bare
 * calls array, and returns { calls, removed } where removed
 * entries carry { handle, type, reason }.
 */
export function filterWallCalls(result) {
  const source = Array.isArray(result)
    ? result
    : result?.calls ?? [];

  const valid = [];
  const removed = [];

  for (const call of source) {
    const reason = wallCallRejection(call);

    if (reason) {
      removed.push({
        handle: call?.handle,
        type: call?.type,
        reason
      });
      continue;
    }

    valid.push(call);
  }

  const collapsed = [];

  for (let i = 0; i < valid.length; ) {
    let j = i + 1;

    while (
      j < valid.length &&
      valid[j].handle !== undefined &&
      valid[j].handle === valid[i].handle
    ) {
      j += 1;
    }

    const group = valid.slice(i, j);
    const merged = collapseWallOutlineChain(group);

    if (merged) {
      collapsed.push(merged);
    } else {
      collapsed.push(...group);
    }

    i = j;
  }

  const calls = [];
  const seen = new Set();

  for (const call of collapsed) {
    const key = duplicateCallKey(
      "wall",
      call.tool,
      call.arguments
    );

    if (seen.has(key)) {
      removed.push({
        handle: call.handle,
        type: call.type,
        reason: "duplicate of an earlier object"
      });
      continue;
    }

    seen.add(key);
    calls.push(call);
  }

  return { calls, removed };
}

/**
 * Default module export.
 */
export default {
  OBJECT_TYPE_REGISTRY,
  SOURCE_FIELD_ALIASES,
  ANNOTATION_LAYER_PATTERN,
  TAG_LAYER_PATTERN,
  parseDxfJson,
  readDxfJson,
  classifyDxfEntity,
  mapDxfEntityToMcp,
  convertDxfJson,
  dispatchDxfJson,
  formatDxfReport,
  annotationSkipReason,
  duplicateCallKey,
  beamArcPoints,
  beamCallRejection,
  filterBeamCalls,
  wallCallRejection,
  wallOutlineCentreline,
  filterWallCalls
};