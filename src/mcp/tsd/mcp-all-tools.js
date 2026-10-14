export const requestExamples = [
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'tsd_status',
      arguments: {}
    }
  },
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'tsd_api_inventory',
      arguments: {}
    }
  },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'tsd_list_api_categories',
      arguments: {}
    }
  },
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'tsd_get_api_category',
      arguments: {
        category: 'application'
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'tsd_run_api_category',
      arguments: {
        category: 'application',
        operation: 'installed-versions',
        limit: 10
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'tsd_list_api_types',
      arguments: {
        namespace: 'TSD.API.Remoting.Structure'
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'tsd_describe_api_type',
      arguments: {
        type: 'TSD.API.Remoting.Structure.IModel'
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 8,
    method: 'tools/call',
    params: {
      name: 'tsd_call_api',
      arguments: {
        target: 'model',
        type: 'TSD.API.Remoting.Structure.IModel',
        method: 'GetLevelsAsync',
        arguments: [null],
        limit: 10,
        expandResult: true
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: {
      name: 'tsd_get_application_info',
      arguments: {}
    }
  },
  {
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: {
      name: 'tsd_get_model_info',
      arguments: {}
    }
  },
  {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/call',
    params: {
      name: 'tsd_get_objects',
      arguments: {
        api: 'members',
        limit: 10
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 12,
    method: 'tools/call',
    params: {
      name: 'tsd_get_selected_objects',
      arguments: {
        limit: 10
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 13,
    method: 'tools/call',
    params: {
      name: 'tsd_get_object_info',
      arguments: {
        api: 'all',
        limit: 10
      }
    }
  },
  {
    jsonrpc: '2.0',
    id: 14,
    method: 'tools/call',
    params: {
      name: 'tsd_list_members',
      arguments: {
        limit: 10
      }
    }
  }
];

const toolDescriptions = {
  tsd_status: 'Get the Trimble Structural Designer application and connection status.',
  tsd_api_inventory: 'List the available Trimble Structural Designer API operations.',
  tsd_list_api_categories: 'List the available Trimble Structural Designer API categories.',
  tsd_get_api_category: 'Get operations available in an API category.',
  tsd_run_api_category: 'Run an operation from an API category.',
  tsd_list_api_types: 'List API types, optionally filtered by namespace.',
  tsd_describe_api_type: 'Describe a Trimble Structural Designer API type.',
  tsd_call_api: 'Call a method on a Trimble Structural Designer API object.',
  tsd_get_application_info: 'Get information about the running Trimble Structural Designer application.',
  tsd_get_model_info: 'Get information about the active Trimble Structural Designer model.',
  tsd_get_objects: 'Get objects from a Trimble Structural Designer API collection.',
  tsd_get_selected_objects: 'Get the objects currently selected in Trimble Structural Designer.',
  tsd_get_object_info: 'Get detailed information about Trimble Structural Designer objects.',
  tsd_list_members: 'List members in the active Trimble Structural Designer model.'
};

const toolSchemas = {
  tsd_get_api_category: {
    properties: { category: { type: 'string' } },
    required: ['category']
  },
  tsd_run_api_category: {
    properties: {
      category: { type: 'string' },
      operation: { type: 'string' },
      limit: { type: 'integer', minimum: 1 }
    },
    required: ['category', 'operation']
  },
  tsd_list_api_types: {
    properties: { namespace: { type: 'string' } }
  },
  tsd_describe_api_type: {
    properties: { type: { type: 'string' } },
    required: ['type']
  },
  tsd_call_api: {
    properties: {
      target: { type: 'string' },
      type: { type: 'string' },
      method: { type: 'string' },
      arguments: { type: 'array', items: {} },
      limit: { type: 'integer', minimum: 1 },
      expandResult: { type: 'boolean' }
    },
    required: ['target', 'type', 'method']
  },
  tsd_get_objects: {
    properties: {
      api: { type: 'string' },
      limit: { type: 'integer', minimum: 1 }
    }
  },
  tsd_get_selected_objects: {
    properties: { limit: { type: 'integer', minimum: 1 } }
  },
  tsd_get_object_info: {
    properties: {
      api: { type: 'string' },
      limit: { type: 'integer', minimum: 1 }
    }
  },
  tsd_list_members: {
    properties: { limit: { type: 'integer', minimum: 1 } }
  }
};

export const tools = requestExamples.map(({ params }) => {
  const { name } = params;
  const schema = toolSchemas[name] || { properties: {} };
  return {
    name,
    description: toolDescriptions[name],
    inputSchema: {
      type: 'object',
      properties: schema.properties,
      ...(schema.required ? { required: schema.required } : {})
    }
  };
});

export async function callTsdTool(name, args = {}) {
  const bridgeUrl = process.env.TSD_BRIDGE_URL?.trim();
  if (!bridgeUrl) {
    throw new Error('TSD_BRIDGE_URL is not configured. Set it to a publicly reachable TSD bridge URL ending in /mcp.');
  }

  const apiKey = process.env.TSD_BRIDGE_KEY;
  if (!apiKey) {
    throw new Error('TSD_BRIDGE_KEY is not configured.');
  }

  let response;
  try {
    response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TSD-Bridge-Key': apiKey
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });
  } catch (error) {
    const reason = error.cause?.code || error.message;
    throw new Error(`Cannot reach the TSD bridge at ${bridgeUrl} (${reason}). On Render, localhost refers to the Render service; configure a publicly reachable TSD_BRIDGE_URL and keep its tunnel online.`);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`TSD bridge returned invalid JSON: ${text}`);
  }

  if (!response.ok) {
    throw new Error(`TSD bridge HTTP ${response.status}: ${payload?.error?.message || text}`);
  }

  if (payload?.error) {
    throw new Error(payload.error.message || 'TSD tool call failed.');
  }
  return payload?.result;
}
