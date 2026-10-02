import fs from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  regions,
  statusSharing,
  topics
} from '../trimble/index.js';
import {
  createWorkspacePairing,
  invokeWorkspace
} from '../trimble/workspace-bridge.js';
import { workspaceApiGroups } from '../trimble/workspace.js';

// NOTE: extractColumnSchedule* and getPdfUpload are now imported lazily
// inside the extract_column_schedule case to keep cold start fast.

import {
  generateCoordScheduleWorkbook
} from '../pdf/coordScheduleExporter.js';

import {
  processColumnSchedule
} from '../pdf/columnScheduleExporter.js';

import {
  callSketchUpTool,
  listSketchUpTools
} from './sketchup/bridge.js';
import { tools as teklaTools } from './tekla/mcp-tools.js';
import * as teklaBridge from './tekla/bridge.js';

const SKETCHUP_PREFIX = 'sketchup_';
const teklaToolNames = new Set(teklaTools.map((tool) => tool.name));
const execFileAsync = promisify(execFile);
const pythonTestScript = fileURLToPath(
  new URL('../python/tender/test.py', import.meta.url)
);

const sketchupFallbackDefinitions = [
  'status',
  'get_selection',
  'capture_view',
  'create_component',
  'delete_component',
  'transform_component',
  'set_material',
  'export_scene',
  'boolean_operation',
  'chamfer_edges',
  'fillet_edges',
  'create_mortise_tenon',
  'create_dovetail',
  'create_finger_joint',
  'eval_ruby'
].map((name) => ({
  name: `${SKETCHUP_PREFIX}${name}`,
  description: '[SketchUp] Tool available when the SketchUp extension is connected.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
}));

let mergedDefinitions = null;

// Extraction timeout. If the extractor hangs, fail loudly instead of
// hanging the request forever. Kept below typical MCP client timeouts so
// the caller gets a clear error instead of an unexplained stall.
const EXTRACT_TIMEOUT_MS = 45_000;

const baseDefinitions = [

  // ============================================================
  // TEKLA STRUCTURES
  // ============================================================

  {
    name: 'tekla_get_status',
    description:
      'Get the current Tekla Structures bridge/model status. This checks the Windows Tekla MCP bridge and returns the Tekla model connection/status information.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'tekla_get_model',
    description:
      'Get the current Tekla Structures model information through the Windows Tekla MCP bridge.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'tekla_get_parts',
    description:
      'Get parts from the currently connected Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object',
          description:
            'Optional filters for Tekla parts.'
        },
        limit: {
          type: 'integer',
          description:
            'Optional maximum number of parts to return.'
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
          type: 'string'
        },
        objectId: {
          type: 'string'
        },
        query: {
          type: 'object'
        }
      }
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
      'Get assemblies from the currently connected Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object'
        },
        limit: {
          type: 'integer'
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
          type: 'string'
        },
        assemblyId: {
          type: 'string'
        }
      }
    }
  },

  {
    name: 'tekla_get_bolts',
    description:
      'Get bolt information from the Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object'
        },
        limit: {
          type: 'integer'
        }
      }
    }
  },

  {
    name: 'tekla_get_welds',
    description:
      'Get weld information from the Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object'
        },
        limit: {
          type: 'integer'
        }
      }
    }
  },

  {
    name: 'tekla_get_rebar',
    description:
      'Get reinforcing bar information from the Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'object'
        },
        limit: {
          type: 'integer'
        }
      }
    }
  },

  {
    name: 'tekla_get_rebar_group',
    description:
      'Get reinforcing bar group information from the Tekla Structures model.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string'
        },
        rebarGroupId: {
          type: 'string'
        },
        query: {
          type: 'object'
        }
      }
    }
  },

  // ============================================================
  // TRIMBLE CONNECT TOOLS
  // ============================================================

  {
    name: 'get_projects',
    description:
      'List Trimble Connect projects available to the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'get_project',
    description:
      'Get details for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_folders',
    description:
      'List folders for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_issues',
    description:
      'List issues for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_issue',
    description:
      'Get a single Trimble Connect issue (BCF topic) by id.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' }
      },
      required: ['projectId', 'topicId']
    }
  },

  {
    name: 'create_issue',
    description:
      'Create a Trimble Connect issue (BCF topic) in a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topic: { description: 'BCF topic payload.' }
      },
      required: ['projectId', 'topic']
    }
  },

  {
    name: 'update_issue',
    description:
      'Update a Trimble Connect issue (BCF topic).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        updates: { description: 'BCF topic update payload.' }
      },
      required: ['projectId', 'topicId', 'updates']
    }
  },

  {
    name: 'get_issue_comments',
    description:
      'List comments on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' }
      },
      required: ['projectId', 'topicId']
    }
  },

  {
    name: 'get_issue_comment',
    description:
      'Get a single comment on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        commentId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'commentId']
    }
  },

  {
    name: 'create_issue_comment',
    description:
      'Add a comment to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        comment: { description: 'Comment payload.' }
      },
      required: ['projectId', 'topicId', 'comment']
    }
  },

  {
    name: 'update_issue_comment',
    description:
      'Update a comment on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        commentId: { type: 'string' },
        updates: { description: 'Comment update payload.' }
      },
      required: ['projectId', 'topicId', 'commentId', 'updates']
    }
  },

  {
    name: 'delete_issue_comment',
    description:
      'Delete a comment on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        commentId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'commentId']
    }
  },

  {
    name: 'get_issue_viewpoints',
    description:
      'List viewpoints on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' }
      },
      required: ['projectId', 'topicId']
    }
  },

  {
    name: 'get_issue_viewpoint',
    description:
      'Get a single viewpoint on a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        viewpointId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'viewpointId']
    }
  },

  {
    name: 'create_issue_viewpoint',
    description:
      'Add a viewpoint to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        viewpoint: { description: 'BCF viewpoint payload.' }
      },
      required: ['projectId', 'topicId', 'viewpoint']
    }
  },

  {
    name: 'delete_issue_viewpoint',
    description:
      'Delete a viewpoint from a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        viewpointId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'viewpointId']
    }
  },

  {
    name: 'get_issue_viewpoint_snapshot',
    description:
      'Get the snapshot image for an issue viewpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        viewpointId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'viewpointId']
    }
  },

  {
    name: 'get_issue_viewpoint_bitmap',
    description:
      'Get a bitmap image referenced by an issue viewpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        viewpointId: { type: 'string' },
        bitmapId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'viewpointId', 'bitmapId']
    }
  },

  {
    name: 'get_issue_document_references',
    description:
      'List document references attached to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' }
      },
      required: ['projectId', 'topicId']
    }
  },

  {
    name: 'get_issue_document_reference',
    description:
      'Get a single document reference attached to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        documentReferenceId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'documentReferenceId']
    }
  },

  {
    name: 'create_issue_document_reference',
    description:
      'Attach a document reference to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        documentReference: { description: 'Document reference payload.' }
      },
      required: ['projectId', 'topicId', 'documentReference']
    }
  },

  {
    name: 'update_issue_document_reference',
    description:
      'Update a document reference attached to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        documentReferenceId: { type: 'string' },
        updates: { description: 'Document reference update payload.' }
      },
      required: ['projectId', 'topicId', 'documentReferenceId', 'updates']
    }
  },

  {
    name: 'delete_issue_document_reference',
    description:
      'Remove a document reference from a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        documentReferenceId: { type: 'string' }
      },
      required: ['projectId', 'topicId', 'documentReferenceId']
    }
  },

  {
    name: 'get_issue_related_topics',
    description:
      'List issues related to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' }
      },
      required: ['projectId', 'topicId']
    }
  },

  {
    name: 'set_issue_related_topics',
    description:
      'Set the issues related to a Trimble Connect issue.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        topicId: { type: 'string' },
        relatedTopics: { description: 'Array of related topic references.' }
      },
      required: ['projectId', 'topicId', 'relatedTopics']
    }
  },

  {
    name: 'get_bcf_projects',
    description:
      'List projects visible to the BCF issues service.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'get_issue_extensions',
    description:
      'Get the BCF extensions schema (allowed types, statuses, priorities) for a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_issue_documents',
    description:
      'List documents available to reference from Trimble Connect issues.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_issue_document',
    description:
      'Get a single document available to reference from Trimble Connect issues.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        documentId: { type: 'string' }
      },
      required: ['projectId', 'documentId']
    }
  },

  {
    name: 'get_bcf_version',
    description:
      'Get the BCF API version supported by the issues service.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'get_current_user',
    description:
      'Get the currently authenticated Trimble Connect user.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'get_user',
    description:
      'Get a Trimble Connect user by id.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string'
        }
      },
      required: ['userId']
    }
  },

  {
    name: 'get_regions',
    description:
      'List Trimble Connect regions.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'create_project',
    description:
      'Create a new Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          description: 'Project payload.'
        }
      },
      required: ['project']
    }
  },

  {
    name: 'update_project',
    description:
      'Update a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        },
        updates: {
          description: 'Project update payload.'
        }
      },
      required: ['projectId', 'updates']
    }
  },

  {
    name: 'delete_project',
    description:
      'Delete a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_project_members',
    description:
      'List members for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_folder',
    description:
      'Get a Trimble Connect folder by id.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string'
        }
      },
      required: ['folderId']
    }
  },

  {
    name: 'create_folder',
    description:
      'Create a folder inside a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        },
        folder: {
          description: 'Folder payload, including parent folder id.'
        }
      },
      required: ['projectId', 'folder']
    }
  },

  {
    name: 'update_folder',
    description:
      'Update a Trimble Connect folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string'
        },
        updates: {
          description: 'Folder update payload.'
        }
      },
      required: ['folderId', 'updates']
    }
  },

  {
    name: 'delete_folder',
    description:
      'Delete a Trimble Connect folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string'
        }
      },
      required: ['folderId']
    }
  },

  {
    name: 'get_subfolders',
    description:
      'List subfolders of a Trimble Connect folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string'
        }
      },
      required: ['folderId']
    }
  },

  {
    name: 'get_folder_files',
    description:
      'List files inside a Trimble Connect folder.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string'
        }
      },
      required: ['folderId']
    }
  },

  {
    name: 'get_file',
    description:
      'Get a Trimble Connect file by id.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string'
        }
      },
      required: ['fileId']
    }
  },

  {
    name: 'update_file',
    description:
      'Update a Trimble Connect file (e.g. rename, move).',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string'
        },
        updates: {
          description: 'File update payload.'
        }
      },
      required: ['fileId', 'updates']
    }
  },

  {
    name: 'delete_file',
    description:
      'Delete a Trimble Connect file.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string'
        }
      },
      required: ['fileId']
    }
  },

  {
    name: 'get_file_versions',
    description:
      'List versions of a Trimble Connect file.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string'
        }
      },
      required: ['fileId']
    }
  },

  {
    name: 'get_todos',
    description:
      'List todos for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_todo',
    description:
      'Get a Trimble Connect todo by id.',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string'
        }
      },
      required: ['todoId']
    }
  },

  {
    name: 'create_todo',
    description:
      'Create a todo in a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        },
        todo: {
          description: 'Todo payload.'
        }
      },
      required: ['projectId', 'todo']
    }
  },

  {
    name: 'update_todo',
    description:
      'Update a Trimble Connect todo.',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string'
        },
        updates: {
          description: 'Todo update payload.'
        }
      },
      required: ['todoId', 'updates']
    }
  },

  {
    name: 'delete_todo',
    description:
      'Delete a Trimble Connect todo.',
    inputSchema: {
      type: 'object',
      properties: {
        todoId: {
          type: 'string'
        }
      },
      required: ['todoId']
    }
  },

  {
    name: 'get_views',
    description:
      'List saved views for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_view',
    description:
      'Get a Trimble Connect saved view by id.',
    inputSchema: {
      type: 'object',
      properties: {
        viewId: {
          type: 'string'
        }
      },
      required: ['viewId']
    }
  },

  {
    name: 'create_view',
    description:
      'Create a saved view in a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        },
        view: {
          description: 'View payload.'
        }
      },
      required: ['projectId', 'view']
    }
  },

  {
    name: 'search_project',
    description:
      'Search within a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string'
        },
        query: {
          description: 'Search query parameters.'
        }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_model',
    description:
      'Get a Trimble Connect model by its file/model id through the Model API.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        modelId: { type: 'string' }
      },
      required: ['modelId']
    }
  },

  {
    name: 'get_model_entities',
    description:
      'List entities in a Trimble Connect model through the Model API.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        modelId: { type: 'string' },
        query: {
          description: 'Query parameters for filtering entities.'
        }
      },
      required: ['modelId']
    }
  },

  {
    name: 'get_model_groups',
    description:
      'List groups (model feature sets) for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' }
      },
      required: ['projectId']
    }
  },

  {
    name: 'get_model_group',
    description:
      'Get a single group (model feature set) for a Trimble Connect project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        groupId: { type: 'string' }
      },
      required: ['projectId', 'groupId']
    }
  },

  {
    name: 'get_property_set_current_user',
    description:
      'Get the current authenticated Property Set user.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'list_property_set_libraries',
    description:
      'List property set libraries available to the authenticated user.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },

  {
    name: 'create_property_set_library',
    description:
      'Create a new property set library.',
    inputSchema: {
      type: 'object',
      properties: {
        library: {
          description: 'Library payload for the Property Set API.'
        }
      },
      required: ['library']
    }
  },

  {
    name: 'get_property_set_library',
    description:
      'Get a single property set library by id.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        }
      },
      required: ['libId']
    }
  },

  {
    name: 'update_property_set_library',
    description:
      'Update an existing property set library.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        updates: {
          description: 'Partial library update payload.'
        }
      },
      required: ['libId', 'updates']
    }
  },

  {
    name: 'delete_property_set_library',
    description:
      'Delete a property set library.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        }
      },
      required: ['libId']
    }
  },

  {
    name: 'list_property_set_definitions',
    description:
      'List definition entries in a property set library.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        query: {
          description: 'Optional query parameters such as top, skiptoken, prefix.'
        }
      },
      required: ['libId']
    }
  },

  {
    name: 'create_property_set_definition',
    description:
      'Create a new property set definition.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        definition: {
          description: 'Definition payload.'
        }
      },
      required: ['libId', 'definition']
    }
  },

  {
    name: 'get_property_set_definition',
    description:
      'Get a property set definition by id.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        }
      },
      required: ['libId', 'defId']
    }
  },

  {
    name: 'update_property_set_definition',
    description:
      'Update a property set definition.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        },
        updates: {
          description: 'Patch payload for the definition.'
        }
      },
      required: ['libId', 'defId', 'updates']
    }
  },

  {
    name: 'delete_property_set_definition',
    description:
      'Delete a property set definition.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        }
      },
      required: ['libId', 'defId']
    }
  },

  {
    name: 'validate_property_set_values',
    description:
      'Validate property values against a property set definition schema.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        },
        values: {
          description: 'Values payload to validate.'
        }
      },
      required: ['libId', 'defId', 'values']
    }
  },

  {
    name: 'list_property_set_instances_by_definition',
    description:
      'List property set instances attached to a definition.',
    inputSchema: {
      type: 'object',
      properties: {
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        }
      },
      required: ['libId', 'defId']
    }
  },

  {
    name: 'list_property_set_instances_for_link',
    description:
      'List property set instances for a specific link id.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string'
        },
        query: {
          description: 'Optional query parameters such as top and skiptoken.'
        }
      },
      required: ['link']
    }
  },

  {
    name: 'get_property_set_instance',
    description:
      'Get a property set instance by link, library, and definition ids.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string'
        },
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        }
      },
      required: ['link', 'libId', 'defId']
    }
  },

  {
    name: 'update_property_set_instance',
    description:
      'Update a property set instance with new property values.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string'
        },
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        },
        props: {
          description: 'Property map to write.'
        }
      },
      required: ['link', 'libId', 'defId', 'props']
    }
  },

  {
    name: 'delete_property_set_instance',
    description:
      'Delete a property set instance by link, library, and definition ids.',
    inputSchema: {
      type: 'object',
      properties: {
        link: {
          type: 'string'
        },
        libId: {
          type: 'string'
        },
        defId: {
          type: 'string'
        }
      },
      required: ['link', 'libId', 'defId']
    }
  },

  {
    name: 'batch_get_property_sets',
    description:
      'Fetch multiple property sets in one request.',
    inputSchema: {
      type: 'object',
      properties: {
        psets: {
          description: 'Array of property set references to request.'
        }
      },
      required: ['psets']
    }
  },

  {
    name: 'apply_property_set_changeset',
    description:
      'Apply a Property Set changeset payload.',
    inputSchema: {
      type: 'object',
      properties: {
        changeset: {
          description: 'Changeset payload to apply.'
        }
      },
      required: ['changeset']
    }
  },

  {
    name: 'apply_property_set_changeset_async',
    description:
      'Apply a Property Set changeset asynchronously and poll for status.',
    inputSchema: {
      type: 'object',
      properties: {
        changeset: {
          description: 'Changeset payload to apply asynchronously.'
        }
      },
      required: ['changeset']
    }
  },

  {
    name: 'get_property_set_changeset_status',
    description:
      'Get the status of a Property Set changeset by id.',
    inputSchema: {
      type: 'object',
      properties: {
        changesetId: {
          type: 'string'
        }
      },
      required: ['changesetId']
    }
  },

  {
    name: 'extract_column_schedule',

    description:
      'Extract a column schedule from a PDF. For PDFs supplied by the client, use uploadId or pdfBase64. Do NOT use a client-local filesystem path such as /mnt/user-data/uploads/. pdfPath is only for a PDF that physically exists on the MCP server.',

    inputSchema: {
      type: 'object',

      properties: {
        uploadId: {
          type: 'string',
          description:
            'Temporary PDF upload ID returned by POST /api/pdf/uploads. Strongly preferred over pdfBase64 — the file bytes are stored server-side and never pass through the model context, avoiding truncation/corruption.'
        },

        pdfBase64: {
          type: 'string',
          description:
            'Base64-encoded PDF contents. Only use this for very small PDFs; large base64 strings can be truncated when re-typed through a chat context, producing an invalid PDF. Prefer uploadId whenever possible.'
        },

        pdfPath: {
          type: 'string',
          description:
            'Path to a PDF physically stored on the MCP server. Do not use client-local paths such as /mnt/user-data/uploads/.'
        }
      },

      oneOf: [
        { required: ['uploadId'] },
        { required: ['pdfBase64'] },
        { required: ['pdfPath'] }
      ]
    }
  },

  {
    name: 'process_column_schedule',
    description:
      'Normalize extracted column-schedule JSON into tabular records.',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          description: 'JSON object or JSON string to process.'
        },
        jsonPath: {
          type: 'string',
          description: 'Optional path to a JSON file instead of passing json inline.'
        }
      }
    }
  },

  {
    name: 'export_coord_schedule_excel',
    description:
      'Convert coordinate-based JSON into an Excel workbook and CSV. Returns download URLs for both files.',
    inputSchema: {
      type: 'object',
      properties: {
        json: {
          description: 'JSON object or JSON string to convert.'
        },
        jsonPath: {
          type: 'string',
          description: 'Optional path to a JSON file instead of passing json inline.'
        },
        outputPath: {
          type: 'string',
          description: 'Optional output path for the resulting XLSX file.'
        },
        sourceName: {
          type: 'string',
          description: 'Optional base name for the outputs (defaults to the JSON filename).'
        }
      }
    }
  },

  ...[
    ['status_sharing_exchange_token', 'Exchange a token for Status Sharing API access.', { admin: { type: 'boolean' }, projectId: { type: 'string' } }],
    ['status_sharing_is_enabled', 'Check whether Status Sharing is enabled for a project.', { projectId: { type: 'string' } }, ['projectId']],
    ['status_sharing_get_statuses', 'Retrieve current statuses for a project. Filter with objectId (modelId is accepted as an alias) or statusActionId.', { projectId: { type: 'string' }, query: { type: 'object', properties: { objectId: { type: 'string' }, modelId: { type: 'string', description: 'Alias for objectId.' }, statusActionId: { type: 'string' }, options: { type: 'string' } } } }, ['projectId']],
    ['status_sharing_get_statuses_page', 'Retrieve a page of current project statuses. The API accepts pageSize values from 1000 to 10000.', { projectId: { type: 'string' }, query: { type: 'object', properties: { objectId: { type: 'string' }, modelId: { type: 'string', description: 'Alias for objectId.' }, statusActionId: { type: 'string' }, cursor: { type: 'string' }, pageSize: { type: 'integer', minimum: 1000, maximum: 10000 } } } }, ['projectId']],
    ['status_sharing_get_custom_status_values', 'List custom status values for a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' } }, ['projectId', 'statusActionId']],
    ['status_sharing_add_custom_status_values', 'Add custom status values to a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' }, values: { type: 'array', items: { type: 'object' } } }, ['projectId', 'statusActionId', 'values']],
    ['status_sharing_get_custom_status_value', 'Get a custom status value.', { projectId: { type: 'string' }, statusActionId: { type: 'string' }, code: { type: 'string' } }, ['projectId', 'statusActionId', 'code']],
    ['status_sharing_update_custom_status_value', 'Update a custom status value.', { projectId: { type: 'string' }, statusActionId: { type: 'string' }, code: { type: 'string' }, value: { type: 'object' } }, ['projectId', 'statusActionId', 'code', 'value']],
    ['status_sharing_get_status_action_group_access', 'Get group access for a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' } }, ['projectId', 'statusActionId']],
    ['status_sharing_update_status_action_group_access', 'Update group access for a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' }, access: { type: 'array', items: { type: 'object' } } }, ['projectId', 'statusActionId', 'access']],
    ['status_sharing_get_license', 'Check the Status Sharing license for a project.', { projectId: { type: 'string' } }, ['projectId']],
    ['status_sharing_get_projects', 'List projects available in Status Sharing.', {}],
    ['status_sharing_get_project', 'Get a Status Sharing project by identifier.', { projectId: { type: 'string' } }, ['projectId']],
    ['status_sharing_get_groups', 'List groups in a Status Sharing project.', { projectId: { type: 'string' } }, ['projectId']],
    ['status_sharing_get_status_actions', 'List status actions in a project.', { projectId: { type: 'string' } }, ['projectId']],
    ['status_sharing_create_status_action', 'Create a status action.', { projectId: { type: 'string' }, statusAction: { type: 'object' } }, ['projectId', 'statusAction']],
    ['status_sharing_get_status_action', 'Get a status action by identifier.', { projectId: { type: 'string' }, statusActionId: { type: 'string' } }, ['projectId', 'statusActionId']],
    ['status_sharing_update_status_action', 'Update a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' }, statusAction: { type: 'object' } }, ['projectId', 'statusActionId', 'statusAction']],
    ['status_sharing_delete_status_action', 'Delete a status action.', { projectId: { type: 'string' }, statusActionId: { type: 'string' } }, ['projectId', 'statusActionId']],
    ['status_sharing_get_status_events', 'Retrieve status events for a project. Filter with objectId (modelId is accepted as an alias) or statusActionId.', { projectId: { type: 'string' }, query: { type: 'object', properties: { objectId: { type: 'string' }, modelId: { type: 'string', description: 'Alias for objectId.' }, statusActionId: { type: 'string' }, options: { type: 'string' } } } }, ['projectId']],
    ['status_sharing_create_status_events', 'Create status events in a project.', { projectId: { type: 'string' }, events: { type: 'array', items: { type: 'object' } } }, ['projectId', 'events']],
    ['status_sharing_get_status_events_page', 'Retrieve a page of project status events. The API accepts pageSize values from 1000 to 10000.', { projectId: { type: 'string' }, query: { type: 'object', properties: { statusActionId: { type: 'string' }, cursor: { type: 'string' }, pageSize: { type: 'integer', minimum: 1000, maximum: 10000 } } } }, ['projectId']],
    ['status_sharing_get_status_event', 'Get a status event by identifier.', { projectId: { type: 'string' }, eventId: { type: 'string' } }, ['projectId', 'eventId']],
    ['workspace_pair', 'Create a one-time pairing link for a Trimble Connect browser extension to expose its Workspace API to this MCP session.', {}],
    ['workspace_list_api', 'List the Workspace API methods available in the paired Trimble Connect browser.', {}],
    ['workspace_call', 'Call a method on the paired Trimble Connect browser Workspace API. Supply method arguments as an ordered array.', { group: { type: 'string', enum: workspaceApiGroups }, method: { type: 'string' }, args: { type: 'array', items: {} } }, ['group', 'method']],
    ['extract_tender_project', 'Extract project metadata, grids, levels, schedules, tables, and BOQ data from uploaded tender PDFs. Upload each PDF with POST /api/pdf/uploads, then pass the returned uploadIds.', { uploadIds: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string' }, description: 'Server-side PDF upload IDs from POST /api/pdf/uploads.' }, projectName: { type: 'string', maxLength: 120 } }, ['uploadIds']],
    ['run_python_test', 'Run the server-side Python hello-world test script.', {}]
  ].map(([name, description, properties, required = []]) => ({
    name,
    description,
    inputSchema: {
      type: 'object',
      properties,
      ...(required.length ? { required } : {})
    }
  }))
];

// export const definitions = baseDefinitions.map((tool) => {
//   const name = tool.name || '';
//   const group = name.includes('property_set') || name.includes('property-set')
//     ? 'Property Set'
//     : name.includes('column_schedule') || name.includes('coord_schedule') || name.includes('pdf')
//       ? 'PDF'
//       : 'Trimble Connect';

//   return {
//     ...tool,
//     tags: [group],
//     category: group
//   };
// });
export const definitions = [
  ...baseDefinitions.filter((tool) => !teklaToolNames.has(tool.name)),
  ...teklaTools
].map((tool) => {
  const name = tool.name || '';

  const group =
    name.startsWith('tekla_')
      ? 'Tekla Structures'
      : name.startsWith('workspace_')
        ? 'Workspace'
      : name === 'run_python_test'
        ? 'Python'
      : name === 'extract_tender_project'
        ? 'PDF'
      : name.includes('property_set') ||
        name.includes('property-set')
        ? 'Property Set'
        : name.startsWith('status_sharing_')
          ? 'Status Sharing'
        : name.includes('column_schedule') ||
          name.includes('coord_schedule') ||
          name.includes('pdf')
          ? 'PDF'
          : 'Trimble Connect';

  return {
    ...tool,
    tags: [group],
    category: group
  };
});

function parseJsonInput(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${label} is required.`);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      throw new Error(`${label} is required.`);
    }

    try {
      return JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Invalid JSON for ${label}: ${error.message}`);
    }
  }

  return value;
}

function decodePdfBase64(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('pdfBase64 must be a non-empty base64 string.');
  }

  // ---- 1. strip data-URI prefix ----
  let base64 = value
    .trim()
    .replace(/^data:application\/pdf;base64,/, '');

  // ---- 2. log diagnostics on the RAW input ----
  console.log('[PDF][b64] raw length:', base64.length);
  console.log('[PDF][b64] length % 4:', base64.length % 4);
  console.log('[PDF][b64] head:', JSON.stringify(base64.slice(0, 40)));
  console.log('[PDF][b64] tail:', JSON.stringify(base64.slice(-40)));
  console.log('[PDF][b64] has whitespace:', /\s/.test(base64));
  console.log('[PDF][b64] has url-safe chars (- or _):', /[-_]/.test(base64));
  console.log('[PDF][b64] has invalid chars:', /[^A-Za-z0-9+/=]/.test(base64));

  // ---- 3. normalize: strip whitespace, convert url-safe ----
  base64 = base64
    .replace(/\s+/g, '')          // remove \n, \r, spaces, tabs
    .replace(/-/g, '+')           // url-safe -> standard
    .replace(/_/g, '/');

  // ---- 4. fix padding if missing (length % 4 === 2 or 3) ----
  if (base64.length % 4 === 2) {
    base64 += '==';
  } else if (base64.length % 4 === 3) {
    base64 += '=';
  }

  // ---- 5. lenient validation ----
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    console.error('[PDF][b64] validation failed.');
    console.error('[PDF][b64] normalized length:', base64.length);
    console.error('[PDF][b64] offending chars:',
      (base64.match(/[^A-Za-z0-9+/=]/g) || []).slice(0, 20)
    );
    console.error('[PDF][b64] head:', JSON.stringify(base64.slice(0, 80)));
    console.error('[PDF][b64] tail:', JSON.stringify(base64.slice(-80)));

    throw new Error(
      'pdfBase64 is not valid base64 (after normalization). ' +
      'See server logs for the offending characters.'
    );
  }

  // ---- 6. decode ----
  const buffer = Buffer.from(base64, 'base64');

  console.log('[PDF][b64] normalized length:', base64.length);
  console.log('[PDF][b64] decoded bytes:', buffer.length);
  console.log('[PDF][b64] PDF magic:',
    buffer.slice(0, 5).toString('latin1')  // should be "%PDF-"
  );

  if (!buffer.length) {
    throw new Error('pdfBase64 decoded to an empty buffer.');
  }

  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error(
      'Decoded data does not look like a PDF (missing %PDF- header). ' +
      'Did you base64-encode the wrong file?'
    );
  }

  // A well-formed PDF ends with an EOF marker (trailer/xref before it).
  // Its absence almost always means the base64 was truncated or mangled
  // in transit (e.g. re-typed through a chat context) rather than a real
  // pdfjs parsing bug — surface that distinctly so callers switch to
  // uploadId, which passes the raw bytes instead of inline base64 text.
  const tail = buffer.slice(-1024).toString('latin1');
  if (!tail.includes('%%EOF')) {
    throw new Error(
      `pdfBase64 decoded to ${buffer.length} bytes but is missing the PDF %%EOF trailer — ` +
      'the file was likely truncated in transit. Upload the PDF via POST /api/pdf/uploads ' +
      'and pass the returned uploadId instead of pdfBase64.'
    );
  }

  return buffer;
}

// ---------- Helper: derive output basename from whatever the caller sent -----
function deriveSourceNameFromArgs(args, fallback = "coord-schedule-output") {
  const stripExt = (n) => String(n).replace(/\.(json|txt|xlsx|csv)$/i, "");

  if (args && args.sourceName) return stripExt(args.sourceName);
  if (args && args.jsonPath)   return stripExt(path.basename(String(args.jsonPath)));
  if (args && args.outputPath) return stripExt(path.basename(String(args.outputPath)));
  return fallback;
}

/**
 * Run a promise-returning function with a hard timeout.
 * Throws a descriptive error if the timeout elapses first.
 */
async function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw new Error(
        `Operation timed out after ${ms} ms: ${label}`
      );
    })
  ]);
}


async function getTeklaStatus() {
  const bridgeUrl = String(
    process.env.TEKLA_BRIDGE_URL || 'http://127.0.0.1:7128'
  ).replace(/\/+$/, '');

  const bridgeKey = process.env.TEKLA_BRIDGE_KEY || '';

  const headers = {
    Accept: 'application/json'
  };

  if (bridgeKey) {
    headers['X-Tekla-Bridge-Key'] = bridgeKey;
  }

  const response = await fetch(
    `${bridgeUrl}/api/tekla/model`,
    {
      method: 'GET',
      headers
    }
  );

  const text = await response.text();

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const detail =
      payload?.error ||
      payload?.message ||
      text ||
      `HTTP ${response.status}`;

    throw new Error(
      `Tekla bridge status request failed (${response.status}): ${detail}`
    );
  }

  return {
    bridgeUrl,
    connected: true,
    status: payload
  };
}

export async function callTool(
  sessionId,
  name,
  args = {}
) {
  let result;

  // Route SketchUp tools
  if (name.startsWith(SKETCHUP_PREFIX)) {
    const realName = name.slice(SKETCHUP_PREFIX.length);
    console.log(`[SketchUp] Forwarding tool call: ${realName}`);
    return callSketchUpTool(realName, args);
  }

  switch (name) {

  case 'extract_tender_project': {
    const { extractTenderProjectFromFiles, getPdfUpload } = await import('../pdf/pdf.js');
    const uploadIds = args.uploadIds;

    if (
      !Array.isArray(uploadIds) ||
      uploadIds.length < 1 ||
      uploadIds.length > 10 ||
      uploadIds.some((uploadId) => typeof uploadId !== 'string' || !uploadId.trim())
    ) {
      throw new Error('Provide 1 to 10 valid PDF uploadIds from POST /api/pdf/uploads.');
    }

    const uploads = await Promise.all(uploadIds.map((uploadId) => getPdfUpload(uploadId)));
    const project = await extractTenderProjectFromFiles(uploads, args.projectName);
    result = { success: true, project };
    break;
  }

  case 'run_python_test': {
    const { stdout, stderr } = await execFileAsync(
      process.env.PYTHON_EXECUTABLE || 'python3',
      [pythonTestScript],
      { timeout: 10_000, maxBuffer: 1024 * 1024 }
    );
    result = {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      exitCode: 0
    };
    break;
  }

  // ============================================================
  // TEKLA STRUCTURES
  // ============================================================

  case 'tekla_get_status':
      result = await getTeklaStatus();
      break;

  case 'tekla_health':
    result = await teklaBridge.teklaHealth();
    break;

  case 'tekla_status':
    result = await teklaBridge.teklaStatus();
    break;

  case 'tekla_diagnostic':
    result = await teklaBridge.teklaDiagnostic();
    break;

  case 'tekla_get_model':
    result = await teklaBridge.teklaModel();
    break;

  case 'tekla_find_objects':
    result = await teklaBridge.teklaParts(args);
    break;

  case 'tekla_get_properties':
    result = await teklaBridge.teklaObject(args);
    break;

  case 'tekla_get_parts':
    result = await getTeklaParts(args);
    break;

  case 'tekla_get_object':
    result = await getTeklaObject(args);
    break;

  case 'tekla_get_selection':
    result = await teklaBridge.teklaSelection(args);
    break;

  case 'tekla_get_attributes':
    result = await teklaBridge.teklaAttributes(args);
    break;

  case 'tekla_get_assemblies':
    result = await teklaBridge.teklaAssemblies(args);
    break;

  case 'tekla_get_assembly':
    result = await teklaBridge.teklaAssembly(args);
    break;

  case 'tekla_get_bolts':
    result = await teklaBridge.teklaBolts(args);
    break;

  case 'tekla_get_welds':
    result = await teklaBridge.teklaWelds(args);
    break;

  case 'tekla_get_rebar':
    result = await teklaBridge.teklaRebar(args);
    break;

  case 'tekla_get_rebar_group':
    result = await teklaBridge.teklaRebarGroup(args);
    break;

  case 'tekla_get_drawings':
    result = await teklaBridge.teklaDrawings(args);
    break;

  case 'tekla_get_drawing':
    result = await teklaBridge.teklaDrawing(args);
    break;

  case 'tekla_get_phases':
    result = await teklaBridge.teklaPhases();
    break;

  case 'tekla_create_beam':
    result = await teklaBridge.teklaCreateBeam(args);
    break;

  case 'tekla_create_column':
    result = await teklaBridge.teklaCreateColumn(args);
    break;

  case 'tekla_create_plate':
    result = await teklaBridge.teklaCreatePlate(args);
    break;

  case 'tekla_update_object':
    result = await teklaBridge.teklaUpdateObject(args);
    break;

  case 'tekla_delete_object':
    result = await teklaBridge.teklaDeleteObject(args);
    break;

  case 'tekla_create_assembly':
    result = await teklaBridge.teklaCreateAssembly(args);
    break;

  case 'tekla_create_weld':
    result = await teklaBridge.teklaCreateWeld(args);
    break;

  case 'tekla_create_bolt':
    result = await teklaBridge.teklaCreateBolt(args);
    break;

  case 'tekla_create_rebar':
    result = await teklaBridge.teklaCreateRebar(args);
    break;

  case 'tekla_create_rebar_group':
    result = await teklaBridge.teklaCreateRebarGroup(args);
    break;

  case 'tekla_create_phase':
    result = await teklaBridge.teklaCreatePhase(args);
    break;

  // ============================================================
  // STATUS SHARING
  // ============================================================

  case 'status_sharing_exchange_token':
    result = await statusSharing.exchangeToken(sessionId, args);
    break;

  case 'status_sharing_is_enabled':
    result = await statusSharing.isEnabled(sessionId, args.projectId);
    break;

  case 'status_sharing_get_statuses':
    result = await statusSharing.getStatuses(sessionId, args.projectId, args.query || {});
    break;

  case 'status_sharing_get_statuses_page':
    result = await statusSharing.getStatusesPage(sessionId, args.projectId, args.query || {});
    break;

  case 'status_sharing_get_custom_status_values':
    result = await statusSharing.getCustomStatusValues(sessionId, args.projectId, args.statusActionId);
    break;

  case 'status_sharing_add_custom_status_values':
    result = await statusSharing.addCustomStatusValues(sessionId, args.projectId, args.statusActionId, args.values);
    break;

  case 'status_sharing_get_custom_status_value':
    result = await statusSharing.getCustomStatusValue(sessionId, args.projectId, args.statusActionId, args.code);
    break;

  case 'status_sharing_update_custom_status_value':
    result = await statusSharing.updateCustomStatusValue(sessionId, args.projectId, args.statusActionId, args.code, args.value);
    break;

  case 'status_sharing_get_status_action_group_access':
    result = await statusSharing.getStatusActionGroupAccess(sessionId, args.projectId, args.statusActionId);
    break;

  case 'status_sharing_update_status_action_group_access':
    result = await statusSharing.updateStatusActionGroupAccess(sessionId, args.projectId, args.statusActionId, args.access);
    break;

  case 'status_sharing_get_license':
    result = await statusSharing.getLicense(sessionId, args.projectId);
    break;

  case 'status_sharing_get_projects':
    result = await statusSharing.getProjects(sessionId);
    break;

  case 'status_sharing_get_project':
    result = await statusSharing.getProject(sessionId, args.projectId);
    break;

  case 'status_sharing_get_groups':
    result = await statusSharing.getGroups(sessionId, args.projectId);
    break;

  case 'status_sharing_get_status_actions':
    result = await statusSharing.getStatusActions(sessionId, args.projectId);
    break;

  case 'status_sharing_create_status_action':
    result = await statusSharing.createStatusAction(sessionId, args.projectId, args.statusAction);
    break;

  case 'status_sharing_get_status_action':
    result = await statusSharing.getStatusAction(sessionId, args.projectId, args.statusActionId);
    break;

  case 'status_sharing_update_status_action':
    result = await statusSharing.updateStatusAction(sessionId, args.projectId, args.statusActionId, args.statusAction);
    break;

  case 'status_sharing_delete_status_action':
    result = await statusSharing.deleteStatusAction(sessionId, args.projectId, args.statusActionId);
    break;

  case 'status_sharing_get_status_events':
    result = await statusSharing.getStatusEvents(sessionId, args.projectId, args.query || {});
    break;

  case 'status_sharing_create_status_events':
    result = await statusSharing.createStatusEvents(sessionId, args.projectId, args.events);
    break;

  case 'status_sharing_get_status_events_page':
    result = await statusSharing.getStatusEventsPage(sessionId, args.projectId, args.query || {});
    break;

  case 'status_sharing_get_status_event':
    result = await statusSharing.getStatusEvent(sessionId, args.projectId, args.eventId);
    break;

  case 'workspace_pair':
    result = createWorkspacePairing(sessionId);
    break;

  case 'workspace_list_api':
    result = await invokeWorkspace(sessionId, { action: 'list' });
    break;

  case 'workspace_call':
    result = await invokeWorkspace(sessionId, {
      action: 'invoke',
      group: args.group,
      method: args.method,
      args: args.args || []
    });
    break;

  // ============================================================
  // EXISTING TRIMBLE CONNECT
  // ============================================================

    case 'get_projects':
      result = await core.getProjects(
        sessionId
      );
      break;

    case 'get_project':
      result = await core.getProject(
        sessionId,
        args.projectId
      );
      break;

    case 'get_folders':
      result = await core.getFolders(
        sessionId,
        args.projectId
      );
      break;

    case 'get_issues':
      result = await topics.getTopics(
        sessionId,
        args.projectId
      );
      break;

    case 'get_issue':
      result = await topics.getTopic(sessionId, args.projectId, args.topicId);
      break;

    case 'create_issue':
      result = await topics.createTopic(sessionId, args.projectId, args.topic);
      break;

    case 'update_issue':
      result = await topics.updateTopic(sessionId, args.projectId, args.topicId, args.updates);
      break;

    case 'get_issue_comments':
      result = await topics.getComments(sessionId, args.projectId, args.topicId);
      break;

    case 'get_issue_comment':
      result = await topics.getComment(sessionId, args.projectId, args.topicId, args.commentId);
      break;

    case 'create_issue_comment':
      result = await topics.createComment(sessionId, args.projectId, args.topicId, args.comment);
      break;

    case 'update_issue_comment':
      result = await topics.updateComment(sessionId, args.projectId, args.topicId, args.commentId, args.updates);
      break;

    case 'delete_issue_comment':
      result = await topics.deleteComment(sessionId, args.projectId, args.topicId, args.commentId);
      break;

    case 'get_issue_viewpoints':
      result = await topics.getViewpoints(sessionId, args.projectId, args.topicId);
      break;

    case 'get_issue_viewpoint':
      result = await topics.getViewpoint(sessionId, args.projectId, args.topicId, args.viewpointId);
      break;

    case 'create_issue_viewpoint':
      result = await topics.createViewpoint(sessionId, args.projectId, args.topicId, args.viewpoint);
      break;

    case 'delete_issue_viewpoint':
      result = await topics.deleteViewpoint(sessionId, args.projectId, args.topicId, args.viewpointId);
      break;

    case 'get_issue_viewpoint_snapshot':
      result = await topics.getViewpointSnapshot(sessionId, args.projectId, args.topicId, args.viewpointId);
      break;

    case 'get_issue_viewpoint_bitmap':
      result = await topics.getViewpointBitmap(sessionId, args.projectId, args.topicId, args.viewpointId, args.bitmapId);
      break;

    case 'get_issue_document_references':
      result = await topics.getDocumentReferences(sessionId, args.projectId, args.topicId);
      break;

    case 'get_issue_document_reference':
      result = await topics.getDocumentReference(sessionId, args.projectId, args.topicId, args.documentReferenceId);
      break;

    case 'create_issue_document_reference':
      result = await topics.createDocumentReference(sessionId, args.projectId, args.topicId, args.documentReference);
      break;

    case 'update_issue_document_reference':
      result = await topics.updateDocumentReference(sessionId, args.projectId, args.topicId, args.documentReferenceId, args.updates);
      break;

    case 'delete_issue_document_reference':
      result = await topics.deleteDocumentReference(sessionId, args.projectId, args.topicId, args.documentReferenceId);
      break;

    case 'get_issue_related_topics':
      result = await topics.getRelatedTopics(sessionId, args.projectId, args.topicId);
      break;

    case 'set_issue_related_topics':
      result = await topics.setRelatedTopics(sessionId, args.projectId, args.topicId, args.relatedTopics);
      break;

    case 'get_bcf_projects':
      result = await topics.getBcfProjects(sessionId);
      break;

    case 'get_issue_extensions':
      result = await topics.getExtensions(sessionId, args.projectId);
      break;

    case 'get_issue_documents':
      result = await topics.getDocuments(sessionId, args.projectId);
      break;

    case 'get_issue_document':
      result = await topics.getDocument(sessionId, args.projectId, args.documentId);
      break;

    case 'get_bcf_version':
      result = await topics.getVersion(sessionId);
      break;

    case 'get_current_user':
      result = await core.getCurrentUser(sessionId);
      break;

    case 'get_user':
      result = await core.getUser(sessionId, args.userId);
      break;

    case 'get_regions':
      result = await regions.getRegions(sessionId);
      break;

    case 'create_project':
      result = await core.createProject(sessionId, args.project);
      break;

    case 'update_project':
      result = await core.updateProject(sessionId, args.projectId, args.updates);
      break;

    case 'delete_project':
      result = await core.deleteProject(sessionId, args.projectId);
      break;

    case 'get_project_members':
      result = await core.getProjectMembers(sessionId, args.projectId);
      break;

    case 'get_folder':
      result = await core.getFolder(sessionId, args.folderId);
      break;

    case 'create_folder':
      result = await core.createFolder(sessionId, args.projectId, args.folder);
      break;

    case 'update_folder':
      result = await core.updateFolder(sessionId, args.folderId, args.updates);
      break;

    case 'delete_folder':
      result = await core.deleteFolder(sessionId, args.folderId);
      break;

    case 'get_subfolders':
      result = await core.getSubfolders(sessionId, args.folderId);
      break;

    case 'get_folder_files':
      result = await core.getFolderFiles(sessionId, args.folderId);
      break;

    case 'get_file':
      result = await core.getFile(sessionId, args.fileId);
      break;

    case 'update_file':
      result = await core.updateFile(sessionId, args.fileId, args.updates);
      break;

    case 'delete_file':
      result = await core.deleteFile(sessionId, args.fileId);
      break;

    case 'get_file_versions':
      result = await core.getFileVersions(sessionId, args.fileId);
      break;

    case 'get_todos':
      result = await organizer.getTodos(sessionId, args.projectId);
      break;

    case 'get_todo':
      result = await organizer.getTodo(sessionId, args.todoId);
      break;

    case 'create_todo':
      result = await organizer.createTodo(sessionId, args.projectId, args.todo);
      break;

    case 'update_todo':
      result = await organizer.updateTodo(sessionId, args.todoId, args.updates);
      break;

    case 'delete_todo':
      result = await organizer.deleteTodo(sessionId, args.todoId);
      break;

    case 'get_views':
      result = await organizer.getViews(sessionId, args.projectId);
      break;

    case 'get_view':
      result = await organizer.getView(sessionId, args.viewId);
      break;

    case 'create_view':
      result = await organizer.createView(sessionId, args.projectId, args.view);
      break;

    case 'search_project':
      result = await core.search(sessionId, args.projectId, args.query);
      break;

    case 'get_model':
      result = await model.getModel(sessionId, args.projectId, args.modelId);
      break;

    case 'get_model_entities':
      result = await model.getEntities(sessionId, args.projectId, args.modelId, args.query);
      break;

    case 'get_model_groups':
      result = await modelFeature.getGroups(sessionId, args.projectId);
      break;

    case 'get_model_group':
      result = await modelFeature.getGroup(sessionId, args.projectId, args.groupId);
      break;

    case 'get_property_set_current_user':
      result = await propertySet.getCurrentUser(sessionId);
      break;

    case 'list_property_set_libraries':
      result = await propertySet.getLibraries(sessionId);
      break;

    case 'create_property_set_library':
      result = await propertySet.createLibrary(sessionId, args.library);
      break;

    case 'get_property_set_library':
      result = await propertySet.getLibrary(sessionId, args.libId);
      break;

    case 'update_property_set_library':
      result = await propertySet.updateLibrary(sessionId, args.libId, args.updates);
      break;

    case 'delete_property_set_library':
      result = await propertySet.deleteLibrary(sessionId, args.libId);
      break;

    case 'list_property_set_definitions':
      result = await propertySet.listDefinitions(sessionId, args.libId, args.query || {});
      break;

    case 'create_property_set_definition':
      result = await propertySet.createDefinition(sessionId, args.libId, args.definition);
      break;

    case 'get_property_set_definition':
      result = await propertySet.getDefinition(sessionId, args.libId, args.defId);
      break;

    case 'update_property_set_definition':
      result = await propertySet.updateDefinition(sessionId, args.libId, args.defId, args.updates);
      break;

    case 'delete_property_set_definition':
      result = await propertySet.deleteDefinition(sessionId, args.libId, args.defId);
      break;

    case 'validate_property_set_values':
      result = await propertySet.validateValues(sessionId, args.libId, args.defId, args.values);
      break;

    case 'list_property_set_instances_by_definition':
      result = await propertySet.listPsetsByDefinition(sessionId, args.libId, args.defId);
      break;

    case 'list_property_set_instances_for_link':
      result = await propertySet.listPsetsForLink(sessionId, args.link, args.query || {});
      break;

    case 'get_property_set_instance':
      result = await propertySet.getPset(sessionId, args.link, args.libId, args.defId);
      break;

    case 'update_property_set_instance':
      result = await propertySet.updatePset(sessionId, args.link, args.libId, args.defId, args.props);
      break;

    case 'delete_property_set_instance':
      result = await propertySet.deletePset(sessionId, args.link, args.libId, args.defId);
      break;

    case 'batch_get_property_sets':
      result = await propertySet.batchGetPsets(sessionId, args.psets);
      break;

    case 'apply_property_set_changeset':
      result = await propertySet.applyChangeset(sessionId, args.changeset);
      break;

    case 'apply_property_set_changeset_async':
      result = await propertySet.applyChangesetAsync(sessionId, args.changeset);
      break;

    case 'get_property_set_changeset_status':
      result = await propertySet.getChangesetStatus(sessionId, args.changesetId);
      break;

    case 'extract_column_schedule': {
      // Lazy-load the PDF modules — they are heavy (pdfjs-dist etc.)
      // and we don't want them to slow down cold start / tools/list.
      const {
        extractColumnScheduleFromPdf,
        extractColumnScheduleFromBuffer
      } = await import('../pdf/extractColumnSchedule.js');

      const { getPdfUpload } = await import('../pdf/pdf.js');

      const uploadId = args.uploadId;
      const pdfPath = args.pdfPath;
      const pdfBase64 = args.pdfBase64;

      // ==========================================
      // VALIDATE INPUT
      // ==========================================

      const suppliedInputs = [uploadId, pdfPath, pdfBase64].filter(
        (value) => value !== undefined && value !== null && value !== ''
      );

      if (suppliedInputs.length === 0) {
        throw new Error(
          'PDF input is required. Provide uploadId, pdfBase64, or a server-side pdfPath.'
        );
      }

      if (suppliedInputs.length > 1) {
        throw new Error(
          'Provide only one of uploadId, pdfBase64, or pdfPath.'
        );
      }

      // ==========================================
      // REJECT CLIENT-LOCAL PATHS
      // ==========================================

      if (pdfPath) {
        const normalizedPath = pdfPath.replace(/\\/g, '/').toLowerCase();

        if (
          normalizedPath.startsWith('/mnt/user-data/') ||
          normalizedPath.startsWith('/mnt/data/') ||
          normalizedPath.startsWith('/users/') ||
          /^[a-z]:\//.test(normalizedPath)
        ) {
          throw new Error(
            'The supplied pdfPath is a client-local path and cannot be accessed by the MCP server. Upload the PDF first and provide uploadId, or provide pdfBase64.'
          );
        }
      }

      // ==========================================
      // UPLOAD ID
      // ==========================================

      if (uploadId) {
        console.log('[PDF] Extracting from uploadId:', uploadId);

        const upload = await getPdfUpload(uploadId);

        console.log('[PDF] Uploaded PDF:', upload.originalname);
        console.log('[PDF] Buffer size:', upload.buffer.length);

        const startedAt = Date.now();

        result = await withTimeout(
          extractColumnScheduleFromBuffer(upload.buffer),
          EXTRACT_TIMEOUT_MS,
          `extractColumnScheduleFromBuffer(uploadId=${uploadId}, ${upload.buffer.length} bytes)`
        );

        console.log(
          '[PDF] Extraction finished in',
          Date.now() - startedAt,
          'ms'
        );

        break;
      }

      // ==========================================
      // BASE64
      // ==========================================

      if (pdfBase64) {
        console.log('[PDF] Extracting from Base64');
        console.log('[PDF] Base64 length:', pdfBase64.length);

        const buffer = decodePdfBase64(pdfBase64);

        console.log('[PDF] Decoded PDF size:', buffer.length);

        const startedAt = Date.now();

        result = await withTimeout(
          extractColumnScheduleFromBuffer(buffer),
          EXTRACT_TIMEOUT_MS,
          `extractColumnScheduleFromBuffer(pdfBase64, ${buffer.length} bytes)`
        );

        console.log(
          '[PDF] Extraction finished in',
          Date.now() - startedAt,
          'ms'
        );

        break;
      }

      // ==========================================
      // SERVER-SIDE PDF PATH
      // ==========================================

      console.log('[PDF] Extracting from server path:', pdfPath);

      const startedAt = Date.now();

      result = await withTimeout(
        extractColumnScheduleFromPdf(pdfPath),
        EXTRACT_TIMEOUT_MS,
        `extractColumnScheduleFromPdf(pdfPath=${pdfPath})`
      );

      console.log(
        '[PDF] Extraction finished in',
        Date.now() - startedAt,
        'ms'
      );

      break;
    }

    case 'process_column_schedule': {
      let jsonValue = args.json;

      if (!jsonValue && args.jsonPath) {
        const jsonFile = path.resolve(args.jsonPath);

        if (!fs.existsSync(jsonFile)) {
          throw new Error(`JSON file not found: ${jsonFile}`);
        }

        jsonValue = fs.readFileSync(jsonFile, 'utf8');
      }

      const payload = parseJsonInput(jsonValue, 'json');
      result = processColumnSchedule(payload);
      break;
    }

    case 'export_coord_schedule_excel': {

      // 1. Load JSON -----------------------------------------------------
      let jsonValue = args.json;

      if (!jsonValue && args.jsonPath) {
        const jsonFile = path.resolve(args.jsonPath);

        if (!fs.existsSync(jsonFile)) {
          throw new Error(`JSON file not found: ${jsonFile}`);
        }

        jsonValue = fs.readFileSync(jsonFile, 'utf8');
      }

      const payload = parseJsonInput(jsonValue, 'json');

      // 2. Filename follows the JSON file ---------------------------------
      const sourceName = deriveSourceNameFromArgs(args);

      console.log('[export_coord_schedule_excel] sourceName =', sourceName);
      console.log('[export_coord_schedule_excel] args.jsonPath =', args.jsonPath);

      // 3. Output directory ----------------------------------------------
      const outputDir = args.outputPath
        ? path.dirname(path.resolve(args.outputPath))
        : process.cwd();

      fs.mkdirSync(outputDir, { recursive: true });

      const finalExcelPath = path.join(outputDir, `${sourceName}.xlsx`);
      const finalCsvPath   = path.join(outputDir, `${sourceName}.csv`);

      console.log('[export_coord_schedule_excel] finalExcelPath =', finalExcelPath);
      console.log('[export_coord_schedule_excel] finalCsvPath   =', finalCsvPath);

      // 4. Timestamped copies for download URLs ---------------------------
      const downloadDirectory = path.join(
        process.cwd(),
        'src',
        'pdf',
        'temp'
      );
      fs.mkdirSync(downloadDirectory, { recursive: true });

      const stamp = Date.now();
      const excelFilename = `coord-schedule-${stamp}.xlsx`;
      const csvFilename   = `coord-schedule-${stamp}.csv`;
      const excelDownloadPath = path.join(downloadDirectory, excelFilename);
      const csvDownloadPath   = path.join(downloadDirectory, csvFilename);

      // 5. Generate -------------------------------------------------------
      result = await generateCoordScheduleWorkbook(
        payload,
        finalExcelPath,   // outputPath
        finalCsvPath,     // csvPath
        sourceName        // sourceName  ← the JSON-derived name
      );

      // 6. Mirror to timestamped downloads --------------------------------
      fs.copyFileSync(finalExcelPath, excelDownloadPath);
      if (result.csvFile && fs.existsSync(result.csvFile)) {
        fs.copyFileSync(result.csvFile, csvDownloadPath);
      }

      // 7. Response -------------------------------------------------------
      const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

      result = {
        ...result,
        csvBuffer: undefined,
        sourceName,
        outputFile: finalExcelPath,
        csvFile: result.csvFile || null,
        excelDownloadUrl: `${publicBaseUrl}/api/pdf/downloads/${excelFilename}`,
        csvDownloadUrl: result.csvFile
          ? `${publicBaseUrl}/api/pdf/downloads/${csvFilename}`
          : null
      };
      break;
    }

    default:
      throw new Error(
        `Unknown tool: ${name}`
      );
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          result,
          null,
          2
        )
      }
    ]
  };
}

//[Start] Route SketchUp tools
export async function getDefinitions() {
  if (mergedDefinitions) return mergedDefinitions;

  // Your existing Trimble tool definitions
  const trimbleDefs = definitions;

  // Fetch SketchUp tools and apply namespace prefix
  const suTools = await listSketchUpTools();
  const suDefs = suTools.map(tool => ({
    ...tool,
    name: tool.name.startsWith(SKETCHUP_PREFIX)
      ? tool.name
      : `${SKETCHUP_PREFIX}${tool.name}`,
    description: `[SketchUp] ${tool.description}`,
  }));

  const merged = [
    ...trimbleDefs,
    ...(suDefs.length > 0 ? suDefs : sketchupFallbackDefinitions)
  ];

  // Do not permanently cache a transient SketchUp startup failure.
  if (suTools.length > 0) {
    mergedDefinitions = merged;
  }

  return merged;
}

export function invalidateDefinitionsCache() {
  mergedDefinitions = null;
}
//[End] Route SketchUp tools
