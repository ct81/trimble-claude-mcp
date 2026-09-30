import { definitions, getDefinitions } from '../mcp/tools.js';

/*
 * ============================================================
 * Swagger / OpenAPI document
 * ============================================================
 *
 * This file documents:
 *
 * 1. Existing REST APIs
 * 2. Dynamic MCP tools
 * 3. SketchUp MCP tools
 * 4. Tekla Structures MCP tools
 *
 * IMPORTANT:
 * Swagger documents the tools.
 * Actual execution is implemented in ../mcp/tools.js
 *
 * ============================================================
 */


/*
 * ============================================================
 * SketchUp fallback definitions
 * ============================================================
 *
 * These remain visible in Swagger even when the live SketchUp
 * process is not connected to the Render server.
 *
 * If a live definition exists in tools.js, the live definition
 * is used instead.
 * ============================================================
 */

const sketchupFallbackDefinitions = [
  {
    name: 'sketchup_status',
    description:
      'Check whether SketchUp is open and reachable.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'sketchup_get_selection',
    description:
      'Get the objects currently selected in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'sketchup_capture_view',
    description:
      'Capture the current SketchUp viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'integer',
          minimum: 100,
          description: 'Optional image width.'
        },
        height: {
          type: 'integer',
          minimum: 100,
          description: 'Optional image height.'
        }
      }
    }
  },

  {
    name: 'sketchup_create_component',
    description:
      'Create a component in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string'
        },
        definition: {
          type: 'object',
          additionalProperties: true
        },
        position: {
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['name']
    }
  },

  {
    name: 'sketchup_delete_component',
    description:
      'Delete a component from SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        }
      },
      required: ['id']
    }
  },

  {
    name: 'sketchup_transform_component',
    description:
      'Transform a SketchUp component.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        transformation: {
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['id', 'transformation']
    }
  },

  {
    name: 'sketchup_set_material',
    description:
      'Set the material of a SketchUp object or component.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        material: {
          type: 'string'
        }
      },
      required: ['id', 'material']
    }
  },

  {
    name: 'sketchup_export_scene',
    description:
      'Export the current SketchUp scene/model.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: [
            'skp',
            'obj',
            'dae',
            'stl',
            '3ds',
            'dwg',
            'dxf'
          ]
        },
        path: {
          type: 'string'
        }
      }
    }
  },

  {
    name: 'sketchup_boolean_operation',
    description:
      'Perform a boolean operation between SketchUp solids.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'union',
            'intersection',
            'difference',
            'outer_shell'
          ]
        },
        targetId: {
          type: 'string'
        },
        toolId: {
          type: 'string'
        }
      },
      required: ['operation', 'targetId', 'toolId']
    }
  },

  {
    name: 'sketchup_chamfer_edges',
    description:
      'Create chamfers on selected SketchUp edges.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        distance: {
          type: 'number'
        }
      },
      required: ['edgeIds', 'distance']
    }
  },

  {
    name: 'sketchup_fillet_edges',
    description:
      'Create fillets on selected SketchUp edges.',
    inputSchema: {
      type: 'object',
      properties: {
        edgeIds: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        radius: {
          type: 'number'
        },
        segments: {
          type: 'integer',
          minimum: 1,
          default: 8
        }
      },
      required: ['edgeIds', 'radius']
    }
  },

  {
    name: 'sketchup_create_mortise_tenon',
    description:
      'Create a mortise and tenon joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        mortise: {
          type: 'object',
          additionalProperties: true
        },
        tenon: {
          type: 'object',
          additionalProperties: true
        }
      }
    }
  },

  {
    name: 'sketchup_create_dovetail',
    description:
      'Create a dovetail joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        targetId: {
          type: 'string'
        },
        toolId: {
          type: 'string'
        },
        width: {
          type: 'number'
        },
        depth: {
          type: 'number'
        },
        angle: {
          type: 'number'
        }
      }
    }
  },

  {
    name: 'sketchup_create_finger_joint',
    description:
      'Create a finger joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        targetId: {
          type: 'string'
        },
        toolId: {
          type: 'string'
        },
        fingers: {
          type: 'integer',
          minimum: 1
        },
        width: {
          type: 'number'
        },
        depth: {
          type: 'number'
        }
      }
    }
  },

  {
    name: 'sketchup_eval_ruby',
    description:
      'Execute Ruby code in the connected SketchUp instance.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'SketchUp Ruby code to execute.'
        }
      },
      required: ['code']
    }
  }
];


/*
 * ============================================================
 * Tekla Structures fallback definitions
 * ============================================================
 *
 * These definitions guarantee that the Tekla MCP API remains
 * visible in Swagger even when Tekla is not currently connected.
 *
 * Live definitions from tools.js override these fallbacks.
 * ============================================================
 */

const teklaFallbackDefinitions = [
  {
    name: 'tekla_get_status',
    description:
      'Check whether the local Tekla Structures bridge is running and whether Tekla Structures is connected.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'tekla_get_model',
    description:
      'Get information about the currently connected Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'tekla_get_parts',
    description:
      'Get parts from the connected Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional Tekla part filter.',
          additionalProperties: true
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 100
        }
      }
    }
  },

  {
    name: 'tekla_get_object',
    description:
      'Get a Tekla Structures model object by identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Tekla model object identifier.'
        }
      },
      required: ['id']
    }
  },

  {
    name: 'tekla_get_selection',
    description:
      'Get the objects currently selected in Tekla Structures.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'tekla_get_assemblies',
    description:
      'Get assemblies from the connected Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional Tekla assembly filter.',
          additionalProperties: true
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 100
        }
      }
    }
  },

  {
    name: 'tekla_get_assembly',
    description:
      'Get a Tekla Structures assembly by identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Tekla assembly identifier.'
        }
      },
      required: ['id']
    }
  },

  {
    name: 'tekla_get_bolts',
    description:
      'Get bolt groups and bolt information from Tekla Structures.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional bolt filter.',
          additionalProperties: true
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 100
        }
      }
    }
  },

  {
    name: 'tekla_get_welds',
    description:
      'Get weld information from Tekla Structures.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional weld filter.',
          additionalProperties: true
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 100
        }
      }
    }
  },

  {
    name: 'tekla_get_rebar',
    description:
      'Get reinforcement objects from Tekla Structures.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional reinforcement filter.',
          additionalProperties: true
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 10000,
          default: 100
        }
      }
    }
  },

  {
    name: 'tekla_get_rebar_group',
    description:
      'Get a Tekla Structures reinforcement group by identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Tekla reinforcement group identifier.'
        }
      },
      required: ['id']
    }
  }
];


/*
 * ============================================================
 * OpenAPI document
 * ============================================================
 */

const swaggerDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Trimble MCP API',
    version: '1.0.0',
    description:
      'Trimble Connect, SketchUp and Tekla Structures MCP API.'
  },

  servers: [
    {
      url: '/'
    }
  ],

  tags: [
    {
      name: 'Core',
      description: 'Core MCP and Trimble Connect operations.'
    },
    {
      name: 'Issues',
      description: 'Trimble Connect / BCF issue operations.'
    },
    {
      name: 'Regions',
      description: 'Trimble Connect region operations.'
    },
    {
      name: 'Organizer',
      description: 'Trimble Connect Organizer operations.'
    },
    {
      name: 'Model',
      description: 'Trimble Connect model operations.'
    },
    {
      name: 'ModelFeature',
      description: 'Trimble Connect model feature operations.'
    },
    {
      name: 'Property Set',
      description: 'Property set operations.'
    },
    {
      name: 'PDF',
      description: 'PDF and schedule extraction operations.'
    },
    {
      name: 'SketchUp',
      description: 'SketchUp MCP operations.'
    },
    {
      name: 'Tekla',
      description: 'Tekla Structures MCP operations.'
    },
    {
      name: 'Health',
      description: 'Service health operations.'
    }
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  },

  paths: {

    /*
     * ========================================================
     * MCP
     * ========================================================
     */

    '/api/mcp/tools': {
      get: {
        tags: ['Core'],
        summary: 'List available MCP tools',
        operationId: 'listMcpTools',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description: 'Available MCP tools',
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
          }
        }
      }
    },

    '/api/mcp/tools/{toolName}': {
      post: {
        tags: ['Core'],
        summary: 'Execute an MCP tool',
        operationId: 'executeMcpTool',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'toolName',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: true
              }
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
          400: {
            description: 'Invalid request'
          },
          401: {
            description: 'Authentication required'
          },
          404: {
            description: 'Tool not found'
          },
          500: {
            description: 'Tool execution failed'
          }
        }
      }
    },


    /*
     * ========================================================
     * Trimble Connect
     * ========================================================
     */

    '/api/projects': {
      get: {
        tags: ['Core'],
        summary: 'Get Trimble Connect projects',
        operationId: 'getProjects',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description: 'Trimble Connect projects',
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
            description: 'Failed to get projects'
          }
        }
      }
    },

    '/api/projects/{projectId}': {
      get: {
        tags: ['Core'],
        summary: 'Get Trimble Connect project',
        operationId: 'getProject',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Trimble Connect project',
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
          404: {
            description: 'Project not found'
          }
        }
      }
    },


    /*
     * ========================================================
     * Folders
     * ========================================================
     */

    '/api/projects/{projectId}/folders': {
      get: {
        tags: ['Core'],
        summary: 'Get Trimble Connect folders',
        operationId: 'getFolders',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Trimble Connect folders',
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
            description: 'Failed to get folders'
          }
        }
      }
    },


    /*
     * ========================================================
     * Issues / BCF
     * ========================================================
     */

    '/api/issues': {
      get: {
        tags: ['Issues'],
        summary: 'Get Trimble Connect issues',
        operationId: 'getIssues',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Issues',
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
            description: 'Failed to get issues'
          }
        }
      }
    },

    '/api/issues/{issueId}': {
      get: {
        tags: ['Issues'],
        summary: 'Get a Trimble Connect issue',
        operationId: 'getIssue',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'issueId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Issue',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },
          404: {
            description: 'Issue not found'
          }
        }
      }
    },


    /*
     * ========================================================
     * Regions
     * ========================================================
     */

    '/api/regions': {
      get: {
        tags: ['Regions'],
        summary: 'Get regions',
        operationId: 'getRegions',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description: 'Regions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },


    /*
     * ========================================================
     * Organizer
     * ========================================================
     */

    '/api/organizer': {
      get: {
        tags: ['Organizer'],
        summary: 'Get Organizer data',
        operationId: 'getOrganizer',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Organizer data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },


    /*
     * ========================================================
     * Model
     * ========================================================
     */

    '/api/models': {
      get: {
        tags: ['Model'],
        summary: 'Get models',
        operationId: 'getModels',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Models',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },

    '/api/models/{modelId}': {
      get: {
        tags: ['Model'],
        summary: 'Get model',
        operationId: 'getModel',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'modelId',
            in: 'path',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Model',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },


    /*
     * ========================================================
     * Model Features
     * ========================================================
     */

    '/api/model-features': {
      get: {
        tags: ['ModelFeature'],
        summary: 'Get model features',
        operationId: 'getModelFeatures',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          },
          {
            name: 'modelId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Model features',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },


    /*
     * ========================================================
     * Property Sets
     * ========================================================
     */

    '/api/property-sets': {
      get: {
        tags: ['Property Set'],
        summary: 'Get property sets',
        operationId: 'getPropertySets',
        security: [
          {
            bearerAuth: []
          }
        ],
        parameters: [
          {
            name: 'projectId',
            in: 'query',
            required: true,
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          200: {
            description: 'Property sets',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },

    '/api/property-sets/libraries': {
      get: {
        tags: ['Property Set'],
        summary: 'List property set libraries',
        operationId: 'listPropertySetLibraries',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description: 'Property set libraries',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },
          500: {
            description: 'Failed to list property set libraries'
          }
        }
      }
    },

    '/api/property-sets/current-user': {
      get: {
        tags: ['Property Set'],
        summary: 'Get current user property set',
        operationId: 'getPropertySetCurrentUser',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description: 'Current user property set',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          }
        }
      }
    },


    /*
     * ========================================================
     * PDF
     * ========================================================
     */

    '/api/pdf/extract-column-schedule': {
      post: {
        tags: ['PDF'],
        summary: 'Extract column schedule from PDF',
        operationId: 'extractColumnSchedule',
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary'
                  }
                },
                required: ['file']
              }
            }
          }
        },
        responses: {
          200: {
            description: 'Extracted column schedule',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },
          400: {
            description: 'Invalid PDF'
          },
          500: {
            description: 'PDF extraction failed'
          }
        }
      }
    },

    '/api/pdf/extract-coordinates': {
      post: {
        tags: ['PDF'],
        summary: 'Extract PDF coordinates',
        operationId: 'extractPdfCoordinates',
        security: [
          {
            bearerAuth: []
          }
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary'
                  }
                },
                required: ['file']
              }
            }
          }
        },
        responses: {
          200: {
            description: 'PDF coordinates',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: true
                }
              }
            }
          },
          500: {
            description: 'PDF coordinate extraction failed'
          }
        }
      }
    },


    /*
     * ========================================================
     * Tekla Status
     * ========================================================
     *
     * Direct bridge status endpoint.
     * ========================================================
     */

    '/api/tekla/status': {
      get: {
        tags: ['Tekla'],
        summary:
          'Check Tekla Structures bridge status',
        description:
          'Check whether the local TeklaStatus bridge is running and whether Tekla Structures is connected.',
        operationId:
          'teklaStatus',
        security: [
          {
            bearerAuth: []
          }
        ],
        responses: {
          200: {
            description:
              'Tekla bridge status',
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
            description:
              'Authentication required'
          },
          503: {
            description:
              'Tekla bridge unavailable'
          }
        }
      }
    }

  }
};


/*
 * ============================================================
 * Build complete Swagger document
 * ============================================================
 */

export async function getSwaggerDocument() {

  /*
   * Clone the base document so each request receives its own
   * document and we do not mutate the global swaggerDocument.
   */
  const doc = structuredClone(swaggerDocument);


  /*
   * ------------------------------------------------------------
   * Get live MCP definitions
   * ------------------------------------------------------------
   */

  let tools = [];

  try {
    tools = await getDefinitions();

    if (!Array.isArray(tools)) {
      tools = [];
    }
  } catch (error) {
    console.error(
      '[Swagger] Failed to get live tool definitions:',
      error?.message || error
    );

    tools = [];
  }


  /*
   * ============================================================
   * SKETCHUP
   * ============================================================
   */

  const liveSketchupTools = new Map(
    tools
      .filter(
        (tool) =>
          tool &&
          typeof tool.name === 'string' &&
          tool.name.startsWith('sketchup_')
      )
      .map((tool) => [tool.name, tool])
  );


  /*
   * Merge fallback + live definitions.
   *
   * If the live tool exists, use it.
   * Otherwise use the fallback.
   */
  const sketchupTools = [
    ...sketchupFallbackDefinitions.map(
      (tool) =>
        liveSketchupTools.get(tool.name) || tool
    ),

    /*
     * Include any additional live SketchUp tools that are not
     * already covered by the fallback list.
     */
    ...tools.filter(
      (tool) =>
        tool &&
        typeof tool.name === 'string' &&
        tool.name.startsWith('sketchup_') &&
        !sketchupFallbackDefinitions.some(
          (fallback) =>
            fallback.name === tool.name
        )
    )
  ];


  /*
   * Add every SketchUp tool to Swagger.
   */

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

    doc.paths[
      `/api/mcp/tools/${toolName}`
    ] = {

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

          required: false,

          content: {

            'application/json': {

              schema: inputSchema

            }

          }

        },

        responses: {

          200: {

            description:
              'SketchUp MCP tool result',

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

            description:
              'Authentication required'

          },

          500: {

            description:
              'SketchUp tool execution failed'

          },

          503: {

            description:
              'SketchUp is unavailable'

          }

        }

      }

    };
  }


  /*
   * ============================================================
   * TEKLA
   * ============================================================
   */

  const liveTeklaTools = new Map(
    tools
      .filter(
        (tool) =>
          tool &&
          typeof tool.name === 'string' &&
          tool.name.startsWith('tekla_')
      )
      .map((tool) => [tool.name, tool])
  );


  /*
   * Merge fallback Tekla definitions with live definitions.
   */

  const teklaTools = [
    ...teklaFallbackDefinitions.map(
      (tool) =>
        liveTeklaTools.get(tool.name) || tool
    ),

    /*
     * Include any additional Tekla tools that may have been
     * added to tools.js in the future.
     */
    ...tools.filter(
      (tool) =>
        tool &&
        typeof tool.name === 'string' &&
        tool.name.startsWith('tekla_') &&
        !teklaFallbackDefinitions.some(
          (fallback) =>
            fallback.name === tool.name
        )
    )
  ];


  /*
   * Add every Tekla tool to Swagger.
   */

  for (const tool of teklaTools) {

    const toolName = tool.name;

    const inputSchema =
      tool.inputSchema || {
        type: 'object',
        properties: {}
      };

    console.log(
      `[Swagger] Adding Tekla tool: ${toolName}`
    );

    doc.paths[
      `/api/mcp/tools/${toolName}`
    ] = {

      post: {

        tags: ['Tekla'],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute Tekla Structures MCP tool: ${toolName}`,

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

            description:
              'Tekla Structures MCP tool result',

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

            description:
              'Authentication required'

          },

          500: {

            description:
              'Tekla Structures tool execution failed'

          },

          503: {

            description:
              'Tekla Bridge or Tekla Structures is unavailable'

          }

        }

      }

    };
  }


  /*
   * ============================================================
   * OTHER LIVE MCP TOOLS
   * ============================================================
   *
   * Do not add SketchUp or Tekla here because they have already
   * been handled above.
   * ============================================================
   */

  const otherTools = tools.filter(
    (tool) =>
      tool &&
      typeof tool.name === 'string' &&
      !tool.name.startsWith('sketchup_') &&
      !tool.name.startsWith('tekla_')
  );


  for (const tool of otherTools) {

    const toolName = tool.name;

    const path =
      `/api/mcp/tools/${toolName}`;


    /*
     * Don't overwrite an explicitly documented API.
     */

    if (doc.paths[path]) {
      continue;
    }


    const inputSchema =
      tool.inputSchema || {
        type: 'object',
        properties: {}
      };


    /*
     * Automatically determine Swagger tag.
     */

    let tag = 'Core';

    if (
      toolName.includes('property_set') ||
      toolName.includes('propertyset')
    ) {
      tag = 'Property Set';

    } else if (
      toolName.includes('schedule') ||
      toolName.includes('pdf') ||
      toolName.includes('column')
    ) {
      tag = 'PDF';

    } else if (
      toolName.includes('issue') ||
      toolName.includes('bcf')
    ) {
      tag = 'Issues';

    } else if (
      toolName.includes('region')
    ) {
      tag = 'Regions';

    } else if (
      toolName.includes('organizer')
    ) {
      tag = 'Organizer';

    } else if (
      toolName.includes('model_feature') ||
      toolName.includes('modelfeature')
    ) {
      tag = 'ModelFeature';

    } else if (
      toolName.includes('model')
    ) {
      tag = 'Model';
    }


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

            description:
              'MCP tool result',

            content: {

              'application/json': {

                schema: {

                  type: 'object',

                  additionalProperties: true

                }

              }

            }

          },

          400: {

            description:
              'Invalid request'

          },

          401: {

            description:
              'Authentication required'

          },

          404: {

            description:
              'MCP tool not found'

          },

          500: {

            description:
              'MCP tool execution failed'

          }

        }

      }

    };
  }


  /*
   * ============================================================
   * Swagger debugging
   * ============================================================
   */

  const swaggerPaths =
    Object.keys(doc.paths);

  const sketchupPaths =
    swaggerPaths.filter(
      (path) =>
        path.includes('/sketchup_')
    );

  const teklaPaths =
    swaggerPaths.filter(
      (path) =>
        path.includes('/tekla_') ||
        path === '/api/tekla/status'
    );


  console.log(
    `[Swagger] Live tools: ${tools.length}`
  );

  console.log(
    `[Swagger] SketchUp tools: ${sketchupTools.length}`
  );

  console.log(
    `[Swagger] Tekla tools: ${teklaTools.length}`
  );

  console.log(
    `[Swagger] Total paths: ${swaggerPaths.length}`
  );

  console.log(
    `[Swagger] SketchUp paths: ${sketchupPaths.length}`
  );

  console.log(
    `[Swagger] Tekla paths: ${teklaPaths.length}`
  );


  console.log(
    '[Swagger] SketchUp endpoints:'
  );

  for (const path of sketchupPaths) {
    console.log(`  POST ${path}`);
  }


  console.log(
    '[Swagger] Tekla endpoints:'
  );

  for (const path of teklaPaths) {

    if (path === '/api/tekla/status') {
      console.log(`  GET  ${path}`);
    } else {
      console.log(`  POST ${path}`);
    }

  }


  /*
   * Return the complete Swagger document.
   */

  return doc;
}


/*
 * ============================================================
 * Export base document as well
 * ============================================================
 *
 * Existing code that imports `swaggerDocument` can continue
 * to use it.
 * ============================================================
 */

export { swaggerDocument };