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

  // Match the specific polybeam type before the generic "beam" substring.
  if (registry.polybeam && /\bpoly ?beam\b/.test(normalized)) {
    return "polybeam";
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
  const entity = String(normalized.dxfEntityType || "").toUpperCase();
  const allowedEntities = classification.objectType === "beam" ? ["LINE", "ARC"] :
    classification.objectType === "polybeam" ? ["ARC"] : null;
  if (allowedEntities && !allowedEntities.includes(entity)) {
    return {
      ok: false,
      handle: normalized.handle,
      objectType: classification.objectType,
      classification: { ...classification, reason: `${normalized.dxfEntityType || "Unknown entity"} is not a ${classification.objectType} path; only ${allowedEntities.join(" and ")} are supported` },
      source: record
    };
  }

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
 * Finds per-type section settings, preferring dedicated size annotations.
 */
export function extractProfilesByType(records) {
  const types = ["polybeam", "column", "beam", "wall", "slab", "footing", "pile"];
  const labels = Object.fromEntries(types.map(type => [type, new Set()]));
  const profiles = Object.fromEntries(types.map(type => [type, new Set()]));
  const section = value => {
    const text = cleanString(value);
    const match = text?.match(/^(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)$/);
    if (match && Number(match[1]) > 0 && Number(match[2]) > 0) {
      return `${Number(match[1])}*${Number(match[2])}`;
    }
    const diameter = text?.match(/^(?:D\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*Dia)$/i);
    if (diameter && Number(diameter[1] || diameter[2]) > 0) return `D${Number(diameter[1] || diameter[2])}`;
    return /^PL\s*\d+(?:\.\d+)?$/i.test(text || "") ? text.replace(/\s+/g, "").toUpperCase() : null;
  };
  for (const record of records) {
    const layer = cleanString(readSource(record, "layer")) || "";
    if (ANNOTATION_LAYER_PATTERN.test(layer)) continue;
    const type = types.find(type => OBJECT_TYPE_REGISTRY[type].layerPatterns.some(pattern => pattern.test(layer))) ||
      classifyDxfEntity(record).objectType;
    if (!profiles[type]) continue;
    const entity = String(readSource(record, "entityType") || "").toUpperCase();
    if (/^(TEXT|MTEXT)$/.test(entity) && /_t2$/i.test(layer)) {
      const profile = section(readSource(record, "name"));
      if (profile) labels[type].add(profile);
      continue;
    }
    if (type === "beam" && !["LINE", "ARC"].includes(entity)) continue;
    if (type === "polybeam" && entity !== "ARC") continue;
    if (annotationSkipReason({ ...record, Layer: layer, Type: entity }) ||
        !/^(LINE|ARC|CIRCLE|POINT|LWPOLYLINE|POLYLINE)$/.test(entity)) continue;
    const geometry = extractGeometry(record);
    if (entity === "LINE" && (!geometry.start || !geometry.end ||
        Math.hypot(geometry.end.x - geometry.start.x, geometry.end.y - geometry.start.y,
          (geometry.end.z || 0) - (geometry.start.z || 0)) === 0)) continue;
    const raw = cleanString(readSource(record, "profile"));
    if (raw) profiles[type].add(section(raw) || raw);
  }
  // Size tags are more specific than exporter profiles copied from nearby objects.
  return Object.fromEntries(types.map(type => [type, [...(labels[type].size ? labels[type] : profiles[type])]]));
}

export function extractBeamProfiles(records) {
  return extractProfilesByType(records).beam;
}

/**
 * Finds bounded faces of a planar beam network. Small support gaps are bridged
 * at intersections and between collinear spans, using column and beam sections.
 */
export function deriveSlabPanels(beamCalls, records, zOverride) {
  const tolerance = 0.1;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const supportSizes = records.filter(record => !annotationSkipReason(record) &&
    /^(CIRCLE|LWPOLYLINE|POLYLINE)$/i.test(readSource(record, "entityType") || "") &&
    OBJECT_TYPE_REGISTRY.column.layerPatterns.some(pattern => pattern.test(readSource(record, "layer") || ""))
  ).flatMap(record => {
    const geometry = extractGeometry(record);
    if (geometry.radius > 0) return [geometry.radius * 2];
    if (geometry.vertices.length >= 3) {
      return [Math.max(...geometry.vertices.map(p => p.x)) - Math.min(...geometry.vertices.map(p => p.x)),
        Math.max(...geometry.vertices.map(p => p.y)) - Math.min(...geometry.vertices.map(p => p.y))];
    }
    return [];
  }).filter(value => value > 0 && Number.isFinite(value));
  const widths = extractBeamProfiles(records).flatMap(profile => {
    const match = profile.match(/^(\d+(?:\.\d+)?)\*/);
    return match ? [Number(match[1])] : [];
  });
  const reach = supportSizes.length ? Math.max(...supportSizes) / 2 + Math.max(0, ...widths) / 2 : tolerance;
  const lines = [], arcs = [], skipped = [];
  const point = (p, level) => p && ({ ...p, z: toNumber(zOverride) ?? p.z ?? level ?? 0 });
  for (const call of beamCalls) {
    if (call.objectType === "wall" && !annotationSkipReason(call.source)) {
      const vertices = call.args.attributes?.vertices || call.args.vertices || [];
      const outline = wallOutlineCentreline(vertices, { requireRectangle: true });
      if (outline) {
        const a = point(outline.start, call.args.level), b = point(outline.end, call.args.level);
        lines.push({ a, b, length: distance(a, b), cuts: [] });
      }
      continue;
    }
    if (!["beam", "polybeam"].includes(call.objectType) || annotationSkipReason(call.source)) continue;
    const entity = String(readSource(call.source, "entityType") || "").toUpperCase();
    const geometry = extractGeometry(call.source);
    if (entity === "LINE") {
      const a = point(call.args.startPoint, geometry.elevation), b = point(call.args.endPoint, geometry.elevation);
      if (!a || !b || distance(a, b) <= tolerance) continue;
      if (Math.abs(a.z - b.z) > tolerance) {
        skipped.push({ handle: call.handle, type: "slab", reason: "sloping beam cannot bound a horizontal slab" });
        continue;
      }
      lines.push({ a, b, length: distance(a, b), cuts: [] });
    } else if (entity === "ARC") {
      try {
        beamArcPoints(call.source);
      } catch (error) {
        skipped.push({ handle: call.handle, type: "slab", reason: error.message });
        continue;
      }
      const center = point(geometry.center, geometry.elevation);
      const start = ((Number(call.source.StartAngle ?? call.source.startAngle) % 360) + 360) % 360 * Math.PI / 180;
      const sweep = ((Number(call.source.EndAngle ?? call.source.endAngle) -
        Number(call.source.StartAngle ?? call.source.startAngle)) % 360 + 360) % 360 * Math.PI / 180;
      arcs.push({ center, radius: geometry.radius, start, end: start + sweep, cuts: [] });
    }
  }
  // Collinear beams can stop on opposite faces of the same column.
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length;) {
      const a = lines[i], b = lines[j];
      const dx = (a.b.x - a.a.x) / a.length, dy = (a.b.y - a.a.y) / a.length;
      const offset = p => (p.x - a.a.x) * dy - (p.y - a.a.y) * dx;
      const along = p => (p.x - a.a.x) * dx + (p.y - a.a.y) * dy;
      const low = Math.min(along(b.a), along(b.b)), high = Math.max(along(b.a), along(b.b));
      if (Math.abs(a.a.z - b.a.z) <= tolerance &&
          Math.max(Math.abs(offset(b.a)), Math.abs(offset(b.b))) <= tolerance &&
          low <= a.length + 2 * reach && high >= -2 * reach) {
        const origin = a.a;
        const at = t => ({ x: origin.x + t * dx, y: origin.y + t * dy, z: origin.z });
        a.a = at(Math.min(0, low)); a.b = at(Math.max(a.length, high)); a.length = distance(a.a, a.b);
        lines.splice(j, 1);
        j = i + 1;
      } else j++;
    }
  }
  // Adjacent perimeter arc pieces stop at column faces. Join only matching circles.
  arcs.sort((a, b) => a.start - b.start);
  for (let i = 0; i < arcs.length; i++) {
    for (let j = i + 1; j < arcs.length;) {
      const a = arcs[i], b = arcs[j];
      if (distance(a.center, b.center) <= tolerance && Math.abs(a.center.z - b.center.z) <= tolerance &&
          Math.abs(a.radius - b.radius) <= tolerance && b.start <= a.end + 2 * reach / a.radius) {
        a.end = Math.max(a.end, b.end);
        arcs.splice(j, 1);
      } else j++;
    }
  }
  const nodes = [], adjacency = [];
  const node = p => {
    let id = nodes.findIndex(q => distance(p, q) <= tolerance && Math.abs(p.z - q.z) <= tolerance);
    if (id < 0) { id = nodes.length; nodes.push(p); adjacency.push(new Set()); }
    return id;
  };
  const edge = (a, b) => {
    const i = node(a), j = node(b);
    if (i !== j) { adjacency[i].add(j); adjacency[j].add(i); }
  };
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const vector = (a, b) => ({ x: b.x - a.x, y: b.y - a.y });
  const within = (line, t) => t >= -reach / line.length && t <= 1 + reach / line.length;
  for (let i = 0; i < lines.length; i++) {
    const a = lines[i], d = vector(a.a, a.b);
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j], e = vector(b.a, b.b), denominator = cross(d, e);
      if (Math.abs(a.a.z - b.a.z) > tolerance || Math.abs(denominator) < 1e-8) continue;
      const delta = vector(a.a, b.a);
      const t = cross(delta, e) / denominator, u = cross(delta, d) / denominator;
      if (within(a, t) && within(b, u)) {
        const p = { x: a.a.x + t * d.x, y: a.a.y + t * d.y, z: a.a.z };
        a.cuts.push({ t, p }); b.cuts.push({ t: u, p });
      }
    }
    for (const arc of arcs) {
      if (Math.abs(a.a.z - arc.center.z) > tolerance) continue;
      const f = vector(arc.center, a.a);
      const aa = d.x * d.x + d.y * d.y, bb = 2 * (f.x * d.x + f.y * d.y);
      const cc = f.x * f.x + f.y * f.y - arc.radius * arc.radius;
      const discriminant = bb * bb - 4 * aa * cc;
      if (discriminant < 0) continue;
      for (const t of [(-bb - Math.sqrt(discriminant)) / (2 * aa), (-bb + Math.sqrt(discriminant)) / (2 * aa)]) {
        if (!within(a, t)) continue;
        const p = { x: a.a.x + t * d.x, y: a.a.y + t * d.y, z: a.a.z };
        let angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
        while (angle < arc.start - reach / arc.radius) angle += 2 * Math.PI;
        if (angle > arc.end + reach / arc.radius) continue;
        a.cuts.push({ t, p }); arc.cuts.push({ t: angle, p });
      }
    }
  }
  for (const line of lines) {
    line.cuts.push({ t: 0, p: line.a }, { t: 1, p: line.b });
    line.cuts.sort((a, b) => a.t - b.t);
    for (let i = 1; i < line.cuts.length; i++) edge(line.cuts[i - 1].p, line.cuts[i].p);
  }
  for (const arc of arcs) {
    arc.cuts.sort((a, b) => a.t - b.t);
    for (let i = 1; i < arc.cuts.length; i++) {
      const a = arc.cuts[i - 1], b = arc.cuts[i];
      if ((b.t - a.t) * arc.radius <= tolerance) continue;
      const points = beamArcPoints({
        Center_X: arc.center.x, Center_Y: arc.center.y, Center_Z: arc.center.z,
        Radius: arc.radius, StartAngle: a.t * 180 / Math.PI, EndAngle: b.t * 180 / Math.PI
      });
      for (let j = 1; j < points.length; j++) edge(points[j - 1], points[j]);
    }
  }
  // Remove dangling support stubs before tracing faces.
  const queue = adjacency.map((neighbors, i) => neighbors.size < 2 ? i : -1).filter(i => i >= 0);
  for (let n = 0; n < queue.length; n++) {
    const i = queue[n];
    for (const j of adjacency[i]) {
      adjacency[j].delete(i);
      if (adjacency[j].size === 1) queue.push(j);
    }
    adjacency[i].clear();
  }
  const ordered = adjacency.map((neighbors, i) => [...neighbors].sort((a, b) =>
    Math.atan2(nodes[a].y - nodes[i].y, nodes[a].x - nodes[i].x) -
    Math.atan2(nodes[b].y - nodes[i].y, nodes[b].x - nodes[i].x)));
  const visited = new Set(), panels = [];
  ordered.forEach((neighbors, i) => {
    for (const j of neighbors) {
      if (visited.has(`${i}:${j}`)) continue;
      const ids = [];
      let a = i, b = j;
      do {
        visited.add(`${a}:${b}`); ids.push(a);
        const next = ordered[b];
        const c = next[(next.indexOf(a) - 1 + next.length) % next.length];
        a = b; b = c;
      } while (!(a === i && b === j) && !visited.has(`${a}:${b}`));
      const points = ids.map(id => nodes[id]);
      const area = points.reduce((sum, p, k) => sum + cross(p, points[(k + 1) % points.length]), 0) / 2;
      if (area > tolerance && new Set(ids).size === ids.length) panels.push(points);
    }
  });
  const labels = records.filter(record => /slab/i.test(readSource(record, "layer") || "") &&
    /^(TEXT|MTEXT)$/i.test(readSource(record, "entityType") || "") &&
    /\bSI\s*\d+/i.test(readSource(record, "name") || "")).map(record => ({
      handle: readSource(record, "handle"), point: point(getPoint(record, "start"), extractGeometry(record).elevation)
    })).filter(label => label.point);
  const contains = (polygon, p) => {
    if (Math.abs(polygon[0].z - p.z) > tolerance) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  const nested = new Set();
  for (const outer of panels) {
    for (const inner of panels) {
      if (outer !== inner && inner.every(p => contains(outer, p))) {
        nested.add(outer); nested.add(inner);
      }
    }
  }
  if (nested.size) skipped.push({ type: "slab",
    reason: "nested slab boundaries may contain openings; holes are not supported, so these regions were skipped" });
  const selected = panels.filter(panel => !nested.has(panel) &&
    (!labels.length || labels.some(label => contains(panel, label.point))));
  for (const label of labels) {
    const matches = selected.filter(panel => contains(panel, label.point));
    if (matches.length !== 1) skipped.push({ handle: label.handle, type: "slab",
      reason: "slab label is not inside one closed supporting boundary; provide a closed slab outline" });
  }
  if (!selected.length) skipped.push({ type: "slab", reason: "no closed slab panels found in supporting beam network" });
  return { panels: selected, skipped };
}

export function triangulateSlabPanel(points) {
  if (points.length < 3 || points.some(p => !p || ![p.x, p.y, p.z].every(Number.isFinite))) {
    throw new Error("slab boundary needs at least three finite XYZ points");
  }
  const remaining = points.map(p => ({ ...p })), triangles = [];
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  while (remaining.length > 3) {
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const a = remaining[(i + remaining.length - 1) % remaining.length], b = remaining[i], c = remaining[(i + 1) % remaining.length];
      if (Math.abs(cross(a, b, c)) < 1e-6) { remaining.splice(i, 1); found = true; break; }
      if (cross(a, b, c) < 0) continue;
      if (remaining.some(p => p !== a && p !== b && p !== c &&
          cross(a, b, p) >= -1e-6 && cross(b, c, p) >= -1e-6 && cross(c, a, p) >= -1e-6)) continue;
      triangles.push([a, b, c]); remaining.splice(i, 1); found = true; break;
    }
    if (!found) throw new Error("slab boundary cannot be triangulated; check for intersecting edges");
  }
  if (remaining.length === 3 && cross(...remaining) > 1e-6) triangles.push(remaining);
  if (!triangles.length) throw new Error("slab boundary has zero area");
  return triangles;
}

/**
 * Pairs beam boundaries whose separation matches the section width. End trims
 * may differ by up to that width. Ambiguous pairs are left unchanged.
 */
export function mergeBeamBoundaries(calls, profilesByType, defaults = {}) {
  const tolerance = 0.1;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  const entries = [];
  const removed = [];
  const seen = new Set();
  for (const call of calls) {
    if (!["beam", "polybeam"].includes(call.objectType) || annotationSkipReason(call.source)) {
      entries.push({ call });
      continue;
    }
    const type = call.objectType;
    const source = call.source;
    const entity = String(readSource(source, "entityType") || "").toUpperCase();
    const configuredZ = toNumber(defaults[type]?.height);
    const point = p => p && ({ ...p, z: configuredZ ?? p.z ?? toNumber(call.args.level) ?? 0 });
    const profile = profilesByType[type]?.length === 1 ? profilesByType[type][0] :
      call.args.profile || defaults[type]?.profile || "";
    const section = String(profile).match(/^(\d+(?:\.\d+)?)\s*[xX*×]\s*(\d+(?:\.\d+)?)$/);
    const width = section ? Number(section[1]) : toNumber(call.args.width);
    const entry = { call, entity, width, profile, start: point(call.args.startPoint), end: point(call.args.endPoint) };
    if (entity === "ARC") {
      entry.center = point(getPoint(source, "center"));
      entry.radius = toNumber(readSource(source, "radius"));
      const start = toNumber(source.StartAngle ?? source.startAngle);
      const end = toNumber(source.EndAngle ?? source.endAngle);
      if (start !== undefined && end !== undefined) {
        entry.angle = ((start % 360) + 360) % 360;
        entry.sweep = ((end - start) % 360 + 360) % 360;
      }
    }
    const coords = p => p && [p.x, p.y, p.z];
    const ends = [coords(entry.start), coords(entry.end)].sort();
    const geometry = entity === "ARC" ? [coords(entry.center), entry.radius, entry.angle, entry.sweep] : ends;
    const dimensions = [entity === "ARC" ? undefined : call.args.length, call.args.width, call.args.depth].map(toNumber);
    entry.dimensions = dimensions;
    const key = JSON.stringify([type, entity, geometry, profile, dimensions, call.args.material, call.args.class]);
    if (seen.has(key)) {
      removed.push({ handle: call.handle, type, reason: "duplicate of an earlier beam boundary" });
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }
  const pair = (a, b) => {
    if (!a.entity || a.entity !== b.entity || a.call.objectType !== b.call.objectType ||
        !(a.width > 0) || a.width !== b.width || a.profile !== b.profile ||
        a.dimensions.slice(1).some((value, i) => value !== b.dimensions[i + 1]) ||
        a.call.args.material !== b.call.args.material || a.call.args.class !== b.call.args.class) return null;
    if (a.entity === "ARC") {
      if (!a.center || !b.center || distance(a.center, b.center) > tolerance ||
          a.angle === undefined || a.sweep === undefined || b.angle === undefined || b.sweep === undefined ||
          !(a.sweep > 0) || !(b.sweep > 0) ||
          !(a.radius > 0) || !(b.radius > 0) ||
          Math.abs(Math.abs(a.radius - b.radius) - a.width) > tolerance) return null;
      const radius = (a.radius + b.radius) / 2;
      const startDelta = ((b.angle - a.angle + 540) % 360) - 180;
      const endDelta = startDelta + b.sweep - a.sweep;
      const trimLimit = a.width + tolerance;
      if (Math.max(Math.abs(startDelta), Math.abs(endDelta)) * Math.PI / 180 * radius > trimLimit ||
          Math.min(a.sweep, b.sweep) * Math.PI / 180 * radius <= a.width * 2) return null;
      const start = a.angle + startDelta / 2;
      const sweep = (a.sweep + b.sweep) / 2;
      return { ...a.call, source: { ...a.call.source, Radius: radius, StartAngle: start, EndAngle: start + sweep } };
    }
    if (a.entity !== "LINE" || !a.start || !a.end || !b.start || !b.end) return null;
    const direct = distance(a.start, b.start) + distance(a.end, b.end);
    const reverse = distance(a.start, b.end) + distance(a.end, b.start);
    const start = direct <= reverse ? b.start : b.end;
    const end = direct <= reverse ? b.end : b.start;
    const offset = { x: start.x - a.start.x, y: start.y - a.start.y, z: start.z - a.start.z };
    const length = distance(a.start, a.end);
    if (!(length > a.width * 2)) return null;
    const direction = { x: (a.end.x - a.start.x) / length, y: (a.end.y - a.start.y) / length, z: (a.end.z - a.start.z) / length };
    const endOffset = { x: end.x - a.end.x, y: end.y - a.end.y, z: end.z - a.end.z };
    const projection = vector => vector.x * direction.x + vector.y * direction.y + vector.z * direction.z;
    const startTrim = projection(offset), endTrim = projection(endOffset);
    const perpendicular = (vector, along) => ({
      x: vector.x - direction.x * along, y: vector.y - direction.y * along, z: vector.z - direction.z * along
    });
    const startGap = perpendicular(offset, startTrim), endGap = perpendicular(endOffset, endTrim);
    if (Math.abs(offset.z) > tolerance || Math.abs(endOffset.z) > tolerance ||
        Math.max(Math.abs(startTrim), Math.abs(endTrim)) > a.width + tolerance ||
        Math.abs(Math.hypot(startGap.x, startGap.y, startGap.z) - a.width) > tolerance ||
        distance(startGap, endGap) > tolerance ||
        distance(start, end) <= a.width * 2) return null;
    const centerStart = midpoint(a.start, start), centerEnd = midpoint(a.end, end);
    return { ...a.call, args: { ...a.call.args, startPoint: centerStart, endPoint: centerEnd,
      ...(a.dimensions[0] !== b.dimensions[0] &&
        a.dimensions.every(value => value > 0) && b.dimensions.every(value => value > 0)
        ? { length: distance(centerStart, centerEnd) } : {}) } };
  };
  const matches = entries.map(() => []);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (pair(entries[i], entries[j])) { matches[i].push(j); matches[j].push(i); }
    }
  }
  const consumed = new Set();
  const merged = [];
  entries.forEach((entry, i) => {
    if (consumed.has(i)) return;
    const j = matches[i][0];
    if (matches[i].length === 1 && matches[j].length === 1) {
      merged.push(pair(entry, entries[j]));
      consumed.add(j);
      removed.push({ handle: entries[j].call.handle, type: entry.call.objectType,
        reason: `merged with beam boundary ${entry.call.handle} into one centerline beam` });
    } else merged.push(entry.call);
  });
  return { calls: merged, removed };
}

/**
 * Converts structural records; unknown and ignored records are returned separately.
 */
export function convertDxfJson(input, options = {}) {
  const records = parseDxfJson(input);
  const profilesByType = extractProfilesByType(records);

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
    beamProfiles: profilesByType.beam,
    profilesByType,
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
export function beamArcPoints(source, zFallback = 0, zOverride) {
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
  const z = toNumber(zOverride) ?? center.z ?? toNumber(readSource(source, "elevation")) ?? zFallback;
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start * Math.PI / 180 + radians * index / segments;
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle), z };
  });
}

/**
 * Applies source length and section dimensions to a straight beam when all
 * three dimensions are positive. Returns null when the dimensions are incomplete.
 */
export function dimensionedBeam(start, end, dimensions = {}) {
  const length = toNumber(dimensions.length);
  const width = toNumber(dimensions.width);
  const depth = toNumber(dimensions.depth);
  if (!(length > 0) || !(width > 0) || !(depth > 0)) return null;

  const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
  const span = Math.hypot(dx, dy, dz);
  if (!(span > 0)) throw new Error("dimensioned beam needs a non-zero direction");

  const profileDimension = value => String(Number(value.toFixed(1)));
  return {
    endPoint: {
      x: start.x + dx / span * length,
      y: start.y + dy / span * length,
      z: start.z + dz / span * length
    },
    profile: `${profileDimension(width)}*${profileDimension(depth)}`
  };
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
  extractBeamProfiles,
  extractProfilesByType,
  deriveSlabPanels,
  triangulateSlabPanel,
  mergeBeamBoundaries,
  dispatchDxfJson,
  formatDxfReport,
  annotationSkipReason,
  duplicateCallKey,
  beamArcPoints,
  dimensionedBeam,
  beamCallRejection,
  filterBeamCalls,
  wallCallRejection,
  wallOutlineCentreline,
  filterWallCalls
};