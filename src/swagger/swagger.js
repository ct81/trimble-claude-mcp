// src/api/swagger.js

import { definitions, getDefinitions } from '../mcp/tools.js';

/*
 * --------------------------------------------------------------------------
 * SketchUp fallback definitions
 * --------------------------------------------------------------------------
 *
 * The published SketchUp MCP server advertises these tools even when the
 * local SketchUp process is not currently reachable.
 *
 * Keep Swagger useful on Render by using this catalog until live definitions
 * are available.
 */
const sketchupFallbackDefinitions = [
  {
    name: 'sketchup_status',
    description: 'Check whether SketchUp is open and reachable.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'sketchup_get_selection',
    description: 'Get the currently selected SketchUp entities.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'sketchup_capture_view',
    description: 'Capture the current SketchUp viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'integer',
          minimum: 1
        },
        height: {
          type: 'integer',
          minimum: 1
        }
      }
    }
  },

  {
    name: 'sketchup_create_component',
    description: 'Create a component in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string'
        },
        definition: {
          type: 'object'
        },
        transform: {
          type: 'object'
        }
      },
      required: ['name']
    }
  },

  {
    name: 'sketchup_delete_component',
    description: 'Delete a component from SketchUp.',
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
    description: 'Transform a SketchUp component.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        transform: {
          type: 'object'
        }
      },
      required: ['id', 'transform']
    }
  },

  {
    name: 'sketchup_set_material',
    description: 'Set the material of a SketchUp component or entity.',
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
    description: 'Export the current SketchUp scene.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string'
        },
        path: {
          type: 'string'
        }
      }
    }
  },

  {
    name: 'sketchup_boolean_operation',
    description: 'Perform a boolean operation between SketchUp solids.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'union',
            'difference',
            'intersection'
          ]
        },
        firstId: {
          type: 'string'
        },
        secondId: {
          type: 'string'
        }
      },
      required: ['operation', 'firstId', 'secondId']
    }
  },

  {
    name: 'sketchup_chamfer_edges',
    description: 'Chamfer selected or specified SketchUp edges.',
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
    description: 'Fillet selected or specified SketchUp edges.',
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
        }
      },
      required: ['edgeIds', 'radius']
    }
  },

  {
    name: 'sketchup_create_mortise_tenon',
    description: 'Create a mortise and tenon joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: {
          type: 'string'
        },
        targetId: {
          type: 'string'
        },
        width: {
          type: 'number'
        },
        depth: {
          type: 'number'
        },
        height: {
          type: 'number'
        }
      },
      required: [
        'componentId',
        'targetId'
      ]
    }
  },

  {
    name: 'sketchup_create_dovetail',
    description: 'Create a dovetail joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: {
          type: 'string'
        },
        targetId: {
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
      },
      required: [
        'componentId',
        'targetId'
      ]
    }
  },

  {
    name: 'sketchup_create_finger_joint',
    description: 'Create a finger joint in SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: {
          type: 'string'
        },
        targetId: {
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
      },
      required: [
        'componentId',
        'targetId',
        'fingers'
      ]
    }
  },

  {
    name: 'sketchup_eval_ruby',
    description: 'Execute Ruby code inside SketchUp.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string'
        }
      },
      required: ['code']
    }
  }
];


/*
 * --------------------------------------------------------------------------
 * Tekla fallback definitions
 * --------------------------------------------------------------------------
 *
 * These definitions ensure the Tekla tools appear in Swagger even when
 * getDefinitions() does not yet return the live Tekla definitions.
 *
 * Runtime execution is handled by:
 *
 * Claude
 *   ↓
 * MCP
 *   ↓
 * callTool()
 *   ↓
 * tekla_get_*
 *   ↓
 * TEKLA_BRIDGE_URL
 *   ↓
 * ngrok
 *   ↓
 * TeklaStatus.exe :7128
 *   ↓
 * Tekla Structures 2026
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
          description: 'Optional Tekla part filter.'
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
          description: 'Optional Tekla assembly filter.'
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
          description: 'Optional bolt filter.'
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
          description: 'Optional weld filter.'
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
          description: 'Optional reinforcement filter.'
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
 * --------------------------------------------------------------------------
 * Base OpenAPI document
 * --------------------------------------------------------------------------
 */
const swaggerDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Trimble MCP API',
    description:
      'REST and MCP tool interface for Trimble Connect, SketchUp and Tekla Structures.',
    version: '1.0.0'
  },

  servers: [
    {
      url: '/'
    }
  ],

  tags: [
    {
      name: 'Core',
      description: 'Core Trimble Connect operations.'
    },

    {
      name: 'Issues',
      description: 'Trimble Connect issues and BCF operations.'
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
      description: 'Trimble Connect Model Feature operations.'
    },

    {
      name: 'Property Set',
      description: 'Trimble Connect Property Set operations.'
    },

    {
      name: 'PDF',
      description: 'PDF extraction and schedule operations.'
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
    },

    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string'
          },
          message: {
            type: 'string'
          }
        }
      },

      TeklaBridgeStatus: {
        type: 'object',
        properties: {
          bridgeUrl: {
            type: 'string'
          },
          connected: {
            type: 'boolean'
          },
          status: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    }
  },

  paths: {

    /*
     * ----------------------------------------------------------------------
     * Health
     * ----------------------------------------------------------------------
     */

    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Check MCP server health.',
        operationId: 'health',
        responses: {
          200: {
            description: 'Service is healthy.',
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
     * ----------------------------------------------------------------------
     * MCP tool catalog
     * ----------------------------------------------------------------------
     */

    '/api/mcp/tools': {
      get: {
        tags: ['Core'],
        summary: 'List available MCP tools.',
        operationId: 'listMcpTools',
        responses: {
          200: {
            description: 'Available MCP tools.',
            content: {
              'application/json': {
                schema: {
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
      }
    },

    '/api/mcp/tools/{toolName}': {
      post: {
        tags: ['Core'],
        summary: 'Execute an MCP tool.',
        operationId: 'executeMcpTool',

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

        security: [
          {
            bearerAuth: []
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
            description: 'Tool result.',
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
            description: 'Invalid request.'
          },

          401: {
            description: 'Authentication required.'
          },

          404: {
            description: 'Tool not found.'
          },

          500: {
            description: 'Tool execution failed.'
          }
        }
      }
    },


    /*
     * ----------------------------------------------------------------------
     * Tekla bridge status
     * ----------------------------------------------------------------------
     *
     * This is a direct REST endpoint and is separate from the MCP
     * tekla_get_status tool.
     */

    '/api/tekla/status': {
      get: {
        tags: ['Tekla'],
        summary: 'Check Tekla Structures bridge status.',
        operationId: 'teklaBridgeStatus',

        security: [
          {
            bearerAuth: []
          }
        ],

        responses: {
          200: {
            description:
              'Tekla Structures bridge status.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/TeklaBridgeStatus'
                }
              }
            }
          },

          401: {
            description: 'Authentication required.'
          },

          503: {
            description:
              'Tekla bridge or Tekla Structures is unavailable.'
          }
        }
      }
    }
  }
};


/*
 * --------------------------------------------------------------------------
 * Helper
 * --------------------------------------------------------------------------
 */

function cloneSchema(schema) {
  if (!schema) {
    return {
      type: 'object',
      properties: {}
    };
  }

  return structuredClone(schema);
}


/*
 * --------------------------------------------------------------------------
 * Build Swagger document
 * --------------------------------------------------------------------------
 */

export async function getSwaggerDocument() {

  const doc = structuredClone(swaggerDocument);

  let tools = [];

  try {
    tools = await getDefinitions();
  } catch (error) {
    console.error(
      '[Swagger] Failed to load live MCP definitions:',
      error
    );

    /*
     * Continue with fallback definitions.
     */
    tools = [];
  }


  /*
   * ------------------------------------------------------------------------
   * Live SketchUp tools
   * ------------------------------------------------------------------------
   */

  const liveSketchupTools = new Map(
    tools
      .filter(
        (tool) =>
          tool &&
          typeof tool.name === 'string' &&
          tool.name.startsWith('sketchup_')
      )
      .map((tool) => [
        tool.name,
        tool
      ])
  );


  /*
   * ------------------------------------------------------------------------
   * Live Tekla tools
   * ------------------------------------------------------------------------
   */

  const liveTeklaTools = new Map(
    tools
      .filter(
        (tool) =>
          tool &&
          typeof tool.name === 'string' &&
          tool.name.startsWith('tekla_')
      )
      .map((tool) => [
        tool.name,
        tool
      ])
  );


  /*
   * ------------------------------------------------------------------------
   * Merge SketchUp fallback + live tools
   * ------------------------------------------------------------------------
   */

  const sketchupTools = [

    /*
     * Use live definition when available.
     */
    ...sketchupFallbackDefinitions.map(
      (tool) =>
        liveSketchupTools.get(tool.name) || tool
    ),

    /*
     * Add additional live SketchUp tools which were not part of
     * the fallback catalog.
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
   * ------------------------------------------------------------------------
   * Merge Tekla fallback + live tools
   * ------------------------------------------------------------------------
   */

  const teklaTools = [

    /*
     * Use live definition when available.
     */
    ...teklaFallbackDefinitions.map(
      (tool) =>
        liveTeklaTools.get(tool.name) || tool
    ),

    /*
     * Add any additional live Tekla tools which are not in
     * the fallback catalog.
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


  console.log(
    `[Swagger] Building document with ${tools.length} live tools, ` +
    `${sketchupTools.length} SketchUp tools and ` +
    `${teklaTools.length} Tekla tools`
  );


  /*
   * ------------------------------------------------------------------------
   * SketchUp MCP tools
   * ------------------------------------------------------------------------
   */

  for (const tool of sketchupTools) {

    const toolName = tool.name;

    const path =
      `/api/mcp/tools/${toolName}`;

    const inputSchema =
      cloneSchema(tool.inputSchema);

    console.log(
      `[Swagger] Adding SketchUp tool: ${toolName}`
    );

    doc.paths[path] = {
      post: {

        tags: [
          'SketchUp'
        ],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute SketchUp MCP tool: ${toolName}`,

        operationId:
          toolName,

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
              'SketchUp MCP tool result.',

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
              'Invalid SketchUp tool request.'
          },

          401: {
            description:
              'Authentication required.'
          },

          500: {
            description:
              'SketchUp tool execution failed.'
          },

          503: {
            description:
              'SketchUp is unavailable.'
          }
        }
      }
    };
  }


  /*
   * ------------------------------------------------------------------------
   * Tekla MCP tools
   * ------------------------------------------------------------------------
   *
   * These are explicitly documented under the Tekla tag.
   */

  for (const tool of teklaTools) {

    const toolName = tool.name;

    const path =
      `/api/mcp/tools/${toolName}`;

    const inputSchema =
      cloneSchema(tool.inputSchema);

    console.log(
      `[Swagger] Adding Tekla tool: ${toolName}`
    );

    doc.paths[path] = {

      post: {

        tags: [
          'Tekla'
        ],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute Tekla Structures MCP tool: ${toolName}`,

        operationId:
          toolName,

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
              'Tekla Structures MCP tool result.',

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
              'Invalid Tekla tool request.'
          },

          401: {
            description:
              'Authentication required.'
          },

          500: {
            description:
              'Tekla Structures tool execution failed.'
          },

          503: {
            description:
              'Tekla Bridge or Tekla Structures is unavailable.'
          }
        }
      }
    };
  }


  /*
   * ------------------------------------------------------------------------
   * Other MCP tools
   * ------------------------------------------------------------------------
   *
   * Keep all non-SketchUp / non-Tekla tools dynamically documented.
   */

  for (const tool of tools) {

    if (!tool || typeof tool.name !== 'string') {
      continue;
    }

    const toolName =
      tool.name;

    /*
     * Already handled above.
     */
    if (
      toolName.startsWith('sketchup_') ||
      toolName.startsWith('tekla_')
    ) {
      continue;
    }

    const path =
      `/api/mcp/tools/${toolName}`;

    const inputSchema =
      cloneSchema(tool.inputSchema);


    /*
     * Determine Swagger category.
     */
    const tag =
      toolName.startsWith('tekla_')
        ? 'Tekla'
        : toolName.includes('property_set')
          ? 'Property Set'
          : toolName.includes('schedule') ||
            toolName.includes('pdf')
            ? 'PDF'
            : toolName.includes('issue') ||
              toolName.includes('bcf')
              ? 'Issues'
              : 'Core';


    console.log(
      `[Swagger] Adding MCP tool: ${toolName} [${tag}]`
    );


    doc.paths[path] = {

      post: {

        tags: [
          tag
        ],

        summary:
          tool.description ||
          `Execute ${toolName}`,

        description:
          tool.description ||
          `Execute MCP tool: ${toolName}`,

        operationId:
          toolName,

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
              'MCP tool result.',

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
              'Invalid tool request.'
          },

          401: {
            description:
              'Authentication required.'
          },

          404: {
            description:
              'MCP tool not found.'
          },

          500: {
            description:
              'MCP tool execution failed.'
          }
        }
      }
    };
  }


  /*
   * ------------------------------------------------------------------------
   * Make sure the fallback Tekla endpoints always exist.
   * ------------------------------------------------------------------------
   *
   * This protects against getDefinitions() returning no Tekla definitions.
   */

  for (const tool of teklaFallbackDefinitions) {

    const path =
      `/api/mcp/tools/${tool.name}`;

    if (!doc.paths[path]) {

      doc.paths[path] = {

        post: {

          tags: [
            'Tekla'
          ],

          summary:
            tool.description ||
            `Execute ${tool.name}`,

          description:
            tool.description ||
            `Execute Tekla Structures MCP tool: ${tool.name}`,

          operationId:
            tool.name,

          security: [
            {
              bearerAuth: []
            }
          ],

          requestBody: {
            required: false,

            content: {
              'application/json': {
                schema:
                  cloneSchema(tool.inputSchema)
              }
            }
          },

          responses: {

            200: {
              description:
                'Tekla Structures MCP tool result.',

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
                'Authentication required.'
            },

            500: {
              description:
                'Tekla Structures tool execution failed.'
            },

            503: {
              description:
                'Tekla Bridge or Tekla Structures is unavailable.'
            }
          }
        }
      };
    }
  }


  /*
   * ------------------------------------------------------------------------
   * Swagger summary logging
   * ------------------------------------------------------------------------
   */

  const teklaPaths =
    Object.keys(doc.paths)
      .filter(
        (path) =>
          path.includes('/tekla_')
      );

  console.log(
    `[Swagger] Tekla MCP paths: ${teklaPaths.length}`
  );

  for (const path of teklaPaths) {
    console.log(
      `[Swagger]   ${path}`
    );
  }


  return doc;
}


/*
 * --------------------------------------------------------------------------
 * Export the static document as well.
 * --------------------------------------------------------------------------
 *
 * Existing code which imports `swaggerDocument` can continue to work.
 */

export {
  swaggerDocument,
  sketchupFallbackDefinitions,
  teklaFallbackDefinitions
};