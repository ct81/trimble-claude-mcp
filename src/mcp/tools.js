import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  topics
} from '../trimble/index.js';

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

const SKETCHUP_PREFIX = 'sketchup_';

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
            'Temporary PDF upload ID returned by POST /api/pdf/uploads. Preferred when the PDF has been uploaded to this MCP server.'
        },

        pdfBase64: {
          type: 'string',
          description:
            'Base64-encoded PDF contents. Use when the client can provide the actual PDF bytes.'
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
  }
];

export const definitions = baseDefinitions.map((tool) => {
  const name = tool.name || '';
  const group = name.includes('property_set') || name.includes('property-set')
    ? 'Property Set'
    : name.includes('column_schedule') || name.includes('coord_schedule') || name.includes('pdf')
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
      result = await core.getRegions(sessionId);
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
      result = await core.getTodos(sessionId, args.projectId);
      break;

    case 'get_todo':
      result = await core.getTodo(sessionId, args.todoId);
      break;

    case 'create_todo':
      result = await core.createTodo(sessionId, args.projectId, args.todo);
      break;

    case 'update_todo':
      result = await core.updateTodo(sessionId, args.todoId, args.updates);
      break;

    case 'delete_todo':
      result = await core.deleteTodo(sessionId, args.todoId);
      break;

    case 'get_views':
      result = await core.getViews(sessionId, args.projectId);
      break;

    case 'get_view':
      result = await core.getView(sessionId, args.viewId);
      break;

    case 'create_view':
      result = await core.createView(sessionId, args.projectId, args.view);
      break;

    case 'search_project':
      result = await core.search(sessionId, args.projectId, args.query);
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
