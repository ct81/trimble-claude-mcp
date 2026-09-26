import { definitions, getDefinitions } from '../mcp/tools.js';

// The published SketchUp MCP server advertises these tools even when the
// desktop SketchUp process is not currently reachable. Keep Swagger useful on
// Render by using this catalog until live definitions are available.
const sketchupFallbackDefinitions = [
  {
    name: 'sketchup_status',
    description: 'Check whether SketchUp is open and reachable.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sketchup_get_selection',
    description: 'List the entities currently selected in SketchUp.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'sketchup_capture_view',
    description: 'Render the SketchUp viewport and return it as an image.',
    inputSchema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['current', 'iso', 'top', 'bottom', 'front', 'back', 'left', 'right'] },
        zoom: { type: 'string', enum: ['none', 'extents', 'selection'] },
        style: { type: 'string', enum: ['current', 'shaded', 'textured', 'wireframe', 'hidden_line', 'xray'] },
        width: { type: 'integer', minimum: 256, maximum: 2000 },
        height: { type: 'integer', minimum: 256, maximum: 2000 },
        format: { type: 'string', enum: ['png', 'jpg'] },
        keep_camera: { type: 'boolean' }
      }
    }
  },
  {
    name: 'sketchup_create_component',
    description: 'Create a primitive solid in the active SketchUp model.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['cube', 'cylinder', 'sphere', 'cone'], default: 'cube' },
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        dimensions: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }
      }
    }
  },
  {
    name: 'sketchup_delete_component',
    description: 'Delete an entity from the active SketchUp model.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    }
  },
  {
    name: 'sketchup_transform_component',
    description: 'Move, rotate, or scale an existing SketchUp entity.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        rotation: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        scale: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }
      },
      required: ['id']
    }
  },
  {
    name: 'sketchup_set_material',
    description: 'Apply a material or colour to an entity.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string' },
        material: { type: 'string' },
        color: { type: 'string' }
      },
      required: ['entity_id']
    }
  },
  {
    name: 'sketchup_export_scene',
    description: 'Export the active SketchUp model to a file.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['skp', 'obj', 'dae', 'stl', 'png', 'jpg'], default: 'skp' },
        width: { type: 'integer', minimum: 1 },
        height: { type: 'integer', minimum: 1 }
      },
      required: ['format']
    }
  },
  {
    name: 'sketchup_boolean_operation',
    description: 'Combine or cut two solid entities.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['union', 'difference', 'intersection'] },
        target_id: { type: 'string' },
        tool_id: { type: 'string' },
        delete_originals: { type: 'boolean', default: false }
      },
      required: ['operation', 'target_id', 'tool_id']
    }
  },
  {
    name: 'sketchup_chamfer_edges',
    description: 'Cut a flat bevel on the edges of a solid.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string' },
        distance: { type: 'number', exclusiveMinimum: 0, default: 0.5 },
        edge_indices: { type: 'array', items: { type: 'integer', minimum: 0 } },
        delete_original: { type: 'boolean', default: false }
      },
      required: ['entity_id']
    }
  },
  {
    name: 'sketchup_fillet_edges',
    description: 'Round the edges of a solid.',
    inputSchema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string' },
        radius: { type: 'number', exclusiveMinimum: 0, default: 0.5 },
        edge_indices: { type: 'array', items: { type: 'integer', minimum: 0 } },
        segments: { type: 'integer', minimum: 1, default: 4 },
        delete_original: { type: 'boolean', default: false }
      },
      required: ['entity_id']
    }
  },
  {
    name: 'sketchup_create_mortise_tenon',
    description: 'Cut a mortise-and-tenon joint between two boards.',
    inputSchema: {
      type: 'object',
      properties: {
        mortise_id: { type: 'string' },
        tenon_id: { type: 'string' },
        width: { type: 'number', exclusiveMinimum: 0, default: 1 },
        height: { type: 'number', exclusiveMinimum: 0, default: 1 },
        depth: { type: 'number', exclusiveMinimum: 0, default: 1 },
        offset_x: { type: 'number', default: 0 },
        offset_y: { type: 'number', default: 0 },
        offset_z: { type: 'number', default: 0 }
      },
      required: ['mortise_id', 'tenon_id']
    }
  },
  {
    name: 'sketchup_create_dovetail',
    description: 'Cut a dovetail joint between two boards.',
    inputSchema: {
      type: 'object',
      properties: {
        tail_id: { type: 'string' },
        pin_id: { type: 'string' },
        width: { type: 'number', exclusiveMinimum: 0, default: 1 },
        height: { type: 'number', exclusiveMinimum: 0, default: 2 },
        depth: { type: 'number', exclusiveMinimum: 0, default: 1 },
        angle: { type: 'number', minimum: 1, maximum: 45, default: 15 },
        num_tails: { type: 'integer', minimum: 1, default: 3 },
        offset_x: { type: 'number', default: 0 },
        offset_y: { type: 'number', default: 0 },
        offset_z: { type: 'number', default: 0 }
      },
      required: ['tail_id', 'pin_id']
    }
  },
  {
    name: 'sketchup_create_finger_joint',
    description: 'Cut a finger joint between two boards.',
    inputSchema: {
      type: 'object',
      properties: {
        board1_id: { type: 'string' },
        board2_id: { type: 'string' },
        width: { type: 'number', exclusiveMinimum: 0, default: 1 },
        height: { type: 'number', exclusiveMinimum: 0, default: 2 },
        depth: { type: 'number', exclusiveMinimum: 0, default: 1 },
        num_fingers: { type: 'integer', minimum: 1, default: 5 },
        offset_x: { type: 'number', default: 0 },
        offset_y: { type: 'number', default: 0 },
        offset_z: { type: 'number', default: 0 }
      },
      required: ['board1_id', 'board2_id']
    }
  },
  {
    name: 'sketchup_eval_ruby',
    description: 'Execute Ruby code inside the SketchUp process. Use only for trusted administrative testing.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', minLength: 1 } },
      required: ['code']
    }
  }
];

// let mergedDefinitions = null;

// export async function getDefinitions() {
//   if (mergedDefinitions) return mergedDefinitions;

//   // Swagger exposes the Trimble testing surface only.
//   mergedDefinitions = definitions;
//   return mergedDefinitions;
// }

// export function invalidateDefinitionsCache() {
//   mergedDefinitions = null;
// }

// const options = {
//   definition: {
//     openapi: '3.0.0',
//     info: { title: 'My API', version: '1.0.0' },
//     paths: { /* ... unchanged ... */ },
//     components: {
//       schemas: {
//         Tool: { /* ... unchanged ... */ },
//       },
//     },
//   },
//   apis: ['./routes/*.js'],
// };


export const swaggerDocument = {

  openapi: '3.0.3',

  info: {
    title: 'Trimble Connect MCP Server',

    description:
      'Trimble Connect API gateway and MCP server',

    version: '1.0.0'
  },

  servers: [
    {
      url:
        process.env.PUBLIC_BASE_URL ||
        'http://localhost:3000'
    }
  ],

  tags: [
    {
      name: 'Core',
      description: 'Core Trimble Connect workspace and service operations.'
    },
    {
      name: 'Issues',
      description: 'BCF issue (topic), comment, viewpoint, and document reference operations.'
    },
    {
      name: 'Property Set',
      description: 'Property Set library, definition, and instance operations.'
    },
    {
      name: 'PDF',
      description: 'Schedule extraction and PDF processing utilities.'
    },
    {
      name: 'SketchUp',
      description: 'SketchUp tools exposed by the connected SketchUp MCP backend.'
    },
    {
      name: 'Health',
      description: 'Service health and diagnostics.'
    }
  ],

  components: {

    securitySchemes: {

      bearerAuth: {

        type: 'http',

        scheme: 'bearer',

        bearerFormat:
          'OAuth2 access token'
      }

    }

  },

  paths: {

    '/api/mcp/tools': {

      get: {

        tags: ['SketchUp'],
        security: [{ bearerAuth: [] }],
        summary: 'List Trimble and connected SketchUp MCP tools',
        description:
          'Returns the current MCP tool definitions. SketchUp tools appear when the SketchUp MCP backend is connected to this server.',

        responses: {
          200: {
            description: 'Available MCP tool definitions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    tools: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: true
                      }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Authentication required'
          }
        }
      }
    },

    '/api/mcp/tools/{toolName}': {

      post: {

        tags: ['SketchUp'],
        security: [{ bearerAuth: [] }],
        summary: 'Call an MCP tool by name',
        description:
          'Call a Trimble or SketchUp MCP tool. Use the prefixed SketchUp name returned by GET /api/mcp/tools, such as sketchup_get_selection.',

        parameters: [
          {
            name: 'toolName',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'sketchup_get_selection'
          }
        ],

        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Arguments for the selected MCP tool.'
              }
            }
          }
        },

        responses: {
          200: {
            description: 'MCP tool result'
          },
          401: {
            description: 'Authentication required'
          },
          500: {
            description: 'MCP tool call failed'
          }
        }
      }
    },

    '/api/pdf/uploads': {

      post: {

        tags: ['PDF'],
        summary:
          'Create a temporary PDF upload for MCP extraction',

        description:
          'Upload a PDF and receive an uploadId. Pass that uploadId to the extract_column_schedule MCP tool. Uploads expire after 15 minutes.',

        security: [],

        requestBody: {

          required: true,

          content: {

            'multipart/form-data': {

              schema: {

                type: 'object',

                required: [
                  'file'
                ],

                properties: {

                  file: {

                    type: 'string',

                    format: 'binary',

                    description:
                      'PDF file to make temporarily available to MCP'

                  }

                }

              }

            }

          }

        },

        responses: {

          201: {

            description:
              'PDF uploaded successfully; use the returned uploadId with MCP'

          },

          400: {

            description:
              'PDF file is missing or invalid'

          }

        }

      }

    },

    '/api/v1/property-set/me': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Get the current authenticated property-set user.',

        responses: {
          200: {
            description: 'Current user details from the Property Set service.'
          }
        }
      }
    },

    '/api/v1/property-set/libs': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'List property-set libraries.',

        responses: {
          200: {
            description: 'Property set library list.'
          }
        }
      },

      post: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Create a property-set library.',

        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },

        responses: {
          201: {
            description: 'Library created.'
          }
        }
      }
    },

    '/api/v1/property-set/libs/{libId}': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Get a property-set library.',

        parameters: [{
          in: 'path',
          name: 'libId',
          required: true,
          schema: { type: 'string' }
        }],

        responses: {
          200: {
            description: 'Library details.'
          }
        }
      },

      patch: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Update a property-set library.',

        parameters: [{
          in: 'path',
          name: 'libId',
          required: true,
          schema: { type: 'string' }
        }],

        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },

        responses: {
          200: {
            description: 'Library updated.'
          }
        }
      },

      delete: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Delete a property-set library.',

        parameters: [{
          in: 'path',
          name: 'libId',
          required: true,
          schema: { type: 'string' }
        }],

        responses: {
          200: {
            description: 'Library deleted.'
          }
        }
      }
    },

    '/api/v1/property-set/libs/{libId}/defs': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'List property-set definitions for a library.',

        parameters: [{
          in: 'path',
          name: 'libId',
          required: true,
          schema: { type: 'string' }
        }],

        responses: {
          200: {
            description: 'Definition collection.'
          }
        }
      },

      post: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Create a property-set definition.',

        parameters: [{
          in: 'path',
          name: 'libId',
          required: true,
          schema: { type: 'string' }
        }],

        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },

        responses: {
          201: {
            description: 'Definition created.'
          }
        }
      }
    },

    '/api/v1/property-set/psets/{link}/{libId}/{defId}': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Get a property set instance for a link.',

        parameters: [
          { in: 'path', name: 'link', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'libId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'defId', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: {
            description: 'Property set instance.'
          }
        }
      },

      patch: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Update a property set instance.',

        parameters: [
          { in: 'path', name: 'link', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'libId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'defId', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },

        responses: {
          200: {
            description: 'Property set updated.'
          }
        }
      },

      delete: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Delete a property set instance.',

        parameters: [
          { in: 'path', name: 'link', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'libId', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'defId', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: {
            description: 'Property set deleted.'
          }
        }
      }
    },

    '/api/v1/property-set/psets/changeset': {

      post: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Apply a property-set changeset.',

        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' }
            }
          }
        },

        responses: {
          200: {
            description: 'Changeset response.'
          }
        }
      }
    },

    '/api/v1/property-set/psets/changeset/{changesetId}': {

      get: {

        tags: ['Property Set'],
        security: [{ bearerAuth: [] }],

        summary: 'Get the status of a Property Set changeset.',

        parameters: [{
          in: 'path',
          name: 'changesetId',
          required: true,
          schema: { type: 'string' }
        }],

        responses: {
          200: {
            description: 'Changeset status response.'
          },
          404: {
            description: 'Changeset was not found.'
          }
        }
      }
    },

    '/health': {

      get: {

        tags: ['Health'],
        security: [],

        summary: 'Health check',

        responses: {

          200: {
            description:
              'Server is healthy'
          }

        }

      }

    },

    '/api/pdf/extract-column-schedule': {

      post: {

        tags: ['PDF'],
        summary:
          'Extract column schedule from PDF',

        description:
          'Upload a Tekla structural column schedule PDF and extract normalized column schedule data.',

        security: [],

        requestBody: {

          required: true,

          content: {

            'multipart/form-data': {

              schema: {

                type: 'object',

                required: [
                  'file'
                ],

                properties: {

                  file: {

                    type: 'string',

                    format: 'binary',

                    description:
                      'PDF file containing the column schedule'

                  }

                }

              }

            }

          }

        },

        responses: {

          200: {

            description:
              'Column schedule extracted successfully',

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  properties: {

                    success: {
                      type: 'boolean'
                    },

                    file: {
                      type: 'string'
                    },

                    count: {
                      type: 'integer'
                    },

                    rows: {

                      type: 'array',

                      items: {

                        type: 'object',

                        properties: {

                          DetailMark: {
                            type: 'string'
                          },

                          StartStorey: {
                            type: 'string'
                          },

                          EndStorey: {
                            type: 'string'
                          },

                          Width: {
                            type: 'number'
                          },

                          Breadth: {
                            type: 'number'
                          },

                          BottomRebar: {
                            type: 'string'
                          },

                          TopRebar: {
                            type: 'string'
                          },

                          Stirrups: {
                            type: 'string'
                          },

                          Method: {
                            type: 'string'
                          }

                        }

                      }

                    }

                  }

                }

              }

            }

          },

          400: {

            description:
              'PDF file is missing'

          },

          500: {

            description:
              'PDF extraction failed'

          }

        }

      }

    },

    '/api/pdf/column-schedule-exporter': {

      post: {

        tags: ['PDF'],
        summary:
          'Upload a column schedule JSON file',

        description:
          'Accept a JSON file containing a column schedule payload, normalize the file content, and return the extracted row data for the exporter workflow.',

        security: [],

        requestBody: {

          required: true,

          content: {

            'multipart/form-data': {

              schema: {

                type: 'object',

                required: [
                  'file'
                ],

                properties: {

                  file: {

                    type: 'string',

                    format: 'binary',

                    description:
                      'JSON file containing the column schedule data'

                  }

                }

              }

            }

          }

        },

        responses: {

          200: {

            description:
              'JSON file accepted and processed successfully',

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  properties: {

                    success: {
                      type: 'boolean'
                    },

                    file: {
                      type: 'string'
                    },

                    count: {
                      type: 'integer'
                    },

                    rows: {
                      type: 'array'
                    },

                    data: {
                      type: 'object'
                    }

                  }

                }

              }

            }

          },

          400: {

            description:
              'JSON file is missing or invalid'

          }

        }

      }

    },

    '/api/pdf/coord-schedule-exporter': {

      post: {

        tags: ['PDF'],
        summary:
          'Upload a PDF coordinate JSON file and export Excel',

        description:
          'Accept a JSON payload produced by a PDF coordinate extraction, reconstruct the coordinate layout into an Excel workbook, and save the generated file on the server.',

        security: [],

        requestBody: {

          required: true,

          content: {

            'multipart/form-data': {

              schema: {

                type: 'object',

                required: [
                  'file'
                ],

                properties: {

                  file: {

                    type: 'string',

                    format: 'binary',

                    description:
                      'JSON file containing PDF coordinate data'

                  }

                }

              }

            }

          }

        },

        responses: {

          200: {

            description:
              'Coordinate JSON processed and Excel export created successfully',

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  properties: {

                    success: {
                      type: 'boolean'
                    },

                    file: {
                      type: 'string'
                    },

                    outputFile: {
                      type: 'string'
                    },

                    itemCount: {
                      type: 'integer'
                    },

                    xClusterCount: {
                      type: 'integer'
                    },

                    yRowCount: {
                      type: 'integer'
                    },

                    data: {
                      type: 'object'
                    }

                  }

                }

              }

            }

          },

          400: {

            description:
              'JSON file is missing or invalid'

          },

          500: {

            description:
              'Excel export failed'

          }

        }

      }

    },

    '/api/v1/users/me': {

      get: {

        tags: ['Core'],
        summary:
          'Get current Trimble Connect user',

        security: [
          {
            bearerAuth: []
          }
        ],

        responses: {

          200: {
            description:
              'Authenticated Trimble Connect user'
          },

          401: {
            description:
              'Authentication required'
          },

          500: {
            description:
              'Trimble API error'
          }

        }

      }

    },

    '/api/v1/regions': {

      get: {

        tags: ['Core'],
        summary:
          'Get Trimble Connect regions',

        security: [
          {
            bearerAuth: []
          }
        ],

        responses: {

          200: {
            description:
              'Available Trimble Connect regions'
          },

          401: {
            description:
              'Authentication required'
          }

        }

      }

    },

    '/api/v1/projects': {

      get: {

        tags: ['Core'],
        summary:
          'Get Trimble Connect projects',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'fullyLoaded',

            in:
              'query',

            required:
              false,

            schema: {
              type: 'boolean'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Projects retrieved successfully'
          },

          401: {
            description:
              'Authentication required'
          },

          500: {
            description:
              'Trimble API error'
          }

        }

      }

    },

    '/api/v1/projects/{projectId}': {

      get: {

        tags: ['Core'],
        summary:
          'Get a Trimble Connect project',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Project retrieved successfully'
          },

          401: {
            description:
              'Authentication required'
          },

          404: {
            description:
              'Project not found'
          }

        }

      }

    },

    '/api/v1/projects/{projectId}/folders': {

      get: {

        tags: ['Core'],
        summary:
          'Get project folders',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Folders retrieved successfully'
          }

        }

      },

      post: {

        tags: ['Core'],
        summary: 'Create a folder in a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          201: { description: 'Folder created successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/projects/{projectId}/files': {

      get: {

        tags: ['Core'],
        summary:
          'Get project files',

        security: [
          {
            bearerAuth: []
          }
        ],

        parameters: [

          {
            name:
              'projectId',

            in:
              'path',

            required:
              true,

            schema: {
              type: 'string'
            }
          }

        ],

        responses: {

          200: {
            description:
              'Files retrieved successfully'
          }

        }

      }

    },

    '/api/v1/users/{userId}': {

      get: {

        tags: ['Core'],
        summary: 'Get a Trimble Connect user by id',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'User retrieved successfully' },
          401: { description: 'Authentication required' },
          404: { description: 'User not found' }
        }

      }

    },

    '/api/v1/projects/{projectId}/members': {

      get: {

        tags: ['Core'],
        summary: 'List members of a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Members retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/folders/{folderId}': {

      get: {

        tags: ['Core'],
        summary: 'Get a Trimble Connect folder',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Folder retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      put: {

        tags: ['Core'],
        summary: 'Update a Trimble Connect folder',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          200: { description: 'Folder updated successfully' },
          401: { description: 'Authentication required' }
        }

      },

      delete: {

        tags: ['Core'],
        summary: 'Delete a Trimble Connect folder',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Folder deleted successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/folders/{folderId}/folders': {

      get: {

        tags: ['Core'],
        summary: 'List subfolders of a Trimble Connect folder',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Subfolders retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/folders/{folderId}/files': {

      get: {

        tags: ['Core'],
        summary: 'List files inside a Trimble Connect folder',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'folderId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Files retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/files/{fileId}': {

      get: {

        tags: ['Core'],
        summary: 'Get a Trimble Connect file',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'File retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      put: {

        tags: ['Core'],
        summary: 'Update a Trimble Connect file',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          200: { description: 'File updated successfully' },
          401: { description: 'Authentication required' }
        }

      },

      delete: {

        tags: ['Core'],
        summary: 'Delete a Trimble Connect file',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'File deleted successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/files/{fileId}/versions': {

      get: {

        tags: ['Core'],
        summary: 'List versions of a Trimble Connect file',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Versions retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      post: {

        tags: ['Core'],
        summary: 'Upload a new version of a Trimble Connect file',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'fileId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          201: { description: 'Version created successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/projects/{projectId}/todos': {

      get: {

        tags: ['Core'],
        summary: 'List todos for a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Todos retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      post: {

        tags: ['Core'],
        summary: 'Create a todo in a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          201: { description: 'Todo created successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/todos/{todoId}': {

      get: {

        tags: ['Core'],
        summary: 'Get a Trimble Connect todo',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'todoId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Todo retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      put: {

        tags: ['Core'],
        summary: 'Update a Trimble Connect todo',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'todoId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          200: { description: 'Todo updated successfully' },
          401: { description: 'Authentication required' }
        }

      },

      delete: {

        tags: ['Core'],
        summary: 'Delete a Trimble Connect todo',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'todoId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Todo deleted successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/projects/{projectId}/views': {

      get: {

        tags: ['Core'],
        summary: 'List saved views for a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Views retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      },

      post: {

        tags: ['Core'],
        summary: 'Create a saved view in a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object' } } }
        },

        responses: {
          201: { description: 'View created successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/views/{viewId}': {

      get: {

        tags: ['Core'],
        summary: 'Get a Trimble Connect saved view',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'viewId', in: 'path', required: true, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'View retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      }

    },

    '/api/v1/projects/{projectId}/search': {

      get: {

        tags: ['Core'],
        summary: 'Search within a Trimble Connect project',
        security: [{ bearerAuth: [] }],

        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'query', in: 'query', required: false, schema: { type: 'string' } }
        ],

        responses: {
          200: { description: 'Search results retrieved successfully' },
          401: { description: 'Authentication required' }
        }

      }

    }

  }

};


// ==========================================
// DYNAMIC SWAGGER DOCUMENT
// ==========================================

export async function getSwaggerDocument() {

  const doc = structuredClone(swaggerDocument);

  const tools = await getDefinitions();
  const liveSketchupTools = new Map(
    tools
      .filter((tool) => tool.name.startsWith('sketchup_'))
      .map((tool) => [tool.name, tool])
  );
  const sketchupTools = [
    ...sketchupFallbackDefinitions.map((tool) =>
      liveSketchupTools.get(tool.name) || tool
    ),
    ...tools.filter(
      (tool) => tool.name.startsWith('sketchup_') &&
        !sketchupFallbackDefinitions.some((fallback) => fallback.name === tool.name)
    )
  ];

  console.log(
    `[Swagger] Building document with ${tools.length} live tools and ${sketchupTools.length} SketchUp tools`
  );

  for (const tool of sketchupTools) {

    const toolName = tool.name;

    const inputSchema =
      tool.inputSchema || {
        type: 'object',
        properties: {}
      };

    console.log(
      `[Swagger] Adding SketchUp tool: ${toolName}`
    );

    doc.paths[`/api/mcp/tools/${toolName}`] = {
      post: {
        tags: ['SketchUp'],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute SketchUp MCP tool: ${toolName}`,

        operationId: toolName,

        security: [
          {
            bearerAuth: []
          }
        ],

        requestBody: {
          required: true,

          content: {
            'application/json': {
              schema: inputSchema
            }
          }
        },

        responses: {
          200: {
            description: 'SketchUp MCP tool result',

            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },

          401: {
            description: 'Authentication required'
          },

          500: {
            description: 'SketchUp tool execution failed'
          }
        }
      }
    };
  }

  // Document every non-SketchUp MCP tool (Core, Property Set, PDF, etc.)
  // generically so new tools appear in Swagger without manual path entries.
  const otherTools = tools.filter(
    (tool) => !tool.name.startsWith('sketchup_')
  );

  for (const tool of otherTools) {

    const toolName = tool.name;
    const path = `/api/mcp/tools/${toolName}`;

    if (doc.paths[path]) {
      continue;
    }

    const inputSchema =
      tool.inputSchema || {
        type: 'object',
        properties: {}
      };

    const tag =
      toolName.includes('property_set')
        ? 'Property Set'
        : toolName.includes('schedule') || toolName.includes('pdf')
          ? 'PDF'
          : toolName.includes('issue') || toolName.includes('bcf')
            ? 'Issues'
            : 'Core';

    doc.paths[path] = {
      post: {
        tags: [tag],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute MCP tool: ${toolName}`,

        operationId: toolName,

        security: [
          {
            bearerAuth: []
          }
        ],

        requestBody: {
          required: false,

          content: {
            'application/json': {
              schema: inputSchema
            }
          }
        },

        responses: {
          200: {
            description: 'MCP tool result',

            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },

          401: {
            description: 'Authentication required'
          },

          500: {
            description: 'MCP tool execution failed'
          }
        }
      }
    };
  }

  return doc;
}