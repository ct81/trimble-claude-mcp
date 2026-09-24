import { definitions } from '../mcp/tools.js';

let mergedDefinitions = null;

export async function getDefinitions() {
  if (mergedDefinitions) return mergedDefinitions;

  // Swagger exposes the Trimble testing surface only.
  mergedDefinitions = definitions;
  return mergedDefinitions;
}

export function invalidateDefinitionsCache() {
  mergedDefinitions = null;
}

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'My API', version: '1.0.0' },
    paths: { /* ... unchanged ... */ },
    components: {
      schemas: {
        Tool: { /* ... unchanged ... */ },
      },
    },
  },
  apis: ['./routes/*.js'],
};


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

    }

  }

};