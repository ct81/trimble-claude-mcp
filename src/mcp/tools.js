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

// Extraction timeout. If the extractor hangs, fail loudly instead of
// hanging the request forever.
const EXTRACT_TIMEOUT_MS = 60_000;

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

// import fs from 'node:fs';
// import path from 'node:path';

// import {
//   core,
//   model,
//   modelFeature,
//   organizer,
//   propertySet,
//   topics
// } from '../trimble/index.js';

// import {
//   extractColumnScheduleFromPdf,
//   extractColumnScheduleFromBuffer
// } from '../pdf/extractColumnSchedule.js';

// import {
//   generateCoordScheduleWorkbook
// } from '../pdf/coordScheduleExporter.js';

// import {
//   processColumnSchedule
// } from '../pdf/columnScheduleExporter.js';

// import {
//   getPdfUpload
// } from '../pdf/pdf.js';

// const baseDefinitions = [
//   {
//     name: 'get_projects',
//     description:
//       'List Trimble Connect projects available to the authenticated user.',
//     inputSchema: {
//       type: 'object',
//       properties: {}
//     }
//   },

//   {
//     name: 'get_project',
//     description:
//       'Get details for a Trimble Connect project.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         projectId: {
//           type: 'string'
//         }
//       },
//       required: ['projectId']
//     }
//   },

//   {
//     name: 'get_folders',
//     description:
//       'List folders for a Trimble Connect project.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         projectId: {
//           type: 'string'
//         }
//       },
//       required: ['projectId']
//     }
//   },

//   {
//     name: 'get_issues',
//     description:
//       'List issues for a Trimble Connect project.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         projectId: {
//           type: 'string'
//         }
//       },
//       required: ['projectId']
//     }
//   },

//   {
//     name: 'get_property_set_current_user',
//     description:
//       'Get the current authenticated Property Set user.',
//     inputSchema: {
//       type: 'object',
//       properties: {}
//     }
//   },

//   {
//     name: 'list_property_set_libraries',
//     description:
//       'List property set libraries available to the authenticated user.',
//     inputSchema: {
//       type: 'object',
//       properties: {}
//     }
//   },

//   {
//     name: 'create_property_set_library',
//     description:
//       'Create a new property set library.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         library: {
//           description: 'Library payload for the Property Set API.'
//         }
//       },
//       required: ['library']
//     }
//   },

//   {
//     name: 'get_property_set_library',
//     description:
//       'Get a single property set library by id.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         }
//       },
//       required: ['libId']
//     }
//   },

//   {
//     name: 'update_property_set_library',
//     description:
//       'Update an existing property set library.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         updates: {
//           description: 'Partial library update payload.'
//         }
//       },
//       required: ['libId', 'updates']
//     }
//   },

//   {
//     name: 'delete_property_set_library',
//     description:
//       'Delete a property set library.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         }
//       },
//       required: ['libId']
//     }
//   },

//   {
//     name: 'list_property_set_definitions',
//     description:
//       'List definition entries in a property set library.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         query: {
//           description: 'Optional query parameters such as top, skiptoken, prefix.'
//         }
//       },
//       required: ['libId']
//     }
//   },

//   {
//     name: 'create_property_set_definition',
//     description:
//       'Create a new property set definition.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         definition: {
//           description: 'Definition payload.'
//         }
//       },
//       required: ['libId', 'definition']
//     }
//   },

//   {
//     name: 'get_property_set_definition',
//     description:
//       'Get a property set definition by id.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         }
//       },
//       required: ['libId', 'defId']
//     }
//   },

//   {
//     name: 'update_property_set_definition',
//     description:
//       'Update a property set definition.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         },
//         updates: {
//           description: 'Patch payload for the definition.'
//         }
//       },
//       required: ['libId', 'defId', 'updates']
//     }
//   },

//   {
//     name: 'delete_property_set_definition',
//     description:
//       'Delete a property set definition.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         }
//       },
//       required: ['libId', 'defId']
//     }
//   },

//   {
//     name: 'validate_property_set_values',
//     description:
//       'Validate property values against a property set definition schema.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         },
//         values: {
//           description: 'Values payload to validate.'
//         }
//       },
//       required: ['libId', 'defId', 'values']
//     }
//   },

//   {
//     name: 'list_property_set_instances_by_definition',
//     description:
//       'List property set instances attached to a definition.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         }
//       },
//       required: ['libId', 'defId']
//     }
//   },

//   {
//     name: 'list_property_set_instances_for_link',
//     description:
//       'List property set instances for a specific link id.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         link: {
//           type: 'string'
//         },
//         query: {
//           description: 'Optional query parameters such as top and skiptoken.'
//         }
//       },
//       required: ['link']
//     }
//   },

//   {
//     name: 'get_property_set_instance',
//     description:
//       'Get a property set instance by link, library, and definition ids.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         link: {
//           type: 'string'
//         },
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         }
//       },
//       required: ['link', 'libId', 'defId']
//     }
//   },

//   {
//     name: 'update_property_set_instance',
//     description:
//       'Update a property set instance with new property values.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         link: {
//           type: 'string'
//         },
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         },
//         props: {
//           description: 'Property map to write.'
//         }
//       },
//       required: ['link', 'libId', 'defId', 'props']
//     }
//   },

//   {
//     name: 'delete_property_set_instance',
//     description:
//       'Delete a property set instance by link, library, and definition ids.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         link: {
//           type: 'string'
//         },
//         libId: {
//           type: 'string'
//         },
//         defId: {
//           type: 'string'
//         }
//       },
//       required: ['link', 'libId', 'defId']
//     }
//   },

//   {
//     name: 'batch_get_property_sets',
//     description:
//       'Fetch multiple property sets in one request.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         psets: {
//           description: 'Array of property set references to request.'
//         }
//       },
//       required: ['psets']
//     }
//   },

//   {
//     name: 'apply_property_set_changeset',
//     description:
//       'Apply a Property Set changeset payload.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         changeset: {
//           description: 'Changeset payload to apply.'
//         }
//       },
//       required: ['changeset']
//     }
//   },

//   {
//     name: 'apply_property_set_changeset_async',
//     description:
//       'Apply a Property Set changeset asynchronously and poll for status.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         changeset: {
//           description: 'Changeset payload to apply asynchronously.'
//         }
//       },
//       required: ['changeset']
//     }
//   },

//   {
//     name: 'get_property_set_changeset_status',
//     description:
//       'Get the status of a Property Set changeset by id.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         changesetId: {
//           type: 'string'
//         }
//       },
//       required: ['changesetId']
//     }
//   },

//   // {
//   //   name: 'extract_column_schedule',
//   //   description:
//   //     'Extract raw PDF column-schedule items from a PDF file path on the server.',
//   //   inputSchema: {
//   //     type: 'object',
//   //     properties: {
//   //       uploadId: {
//   //         type: 'string',
//   //         description: 'Temporary PDF upload ID returned by POST /api/pdf/uploads.'
//   //       },
//   //       pdfPath: {
//   //         type: 'string',
//   //         description: 'Absolute or relative path to a PDF file on the MCP server.'
//   //       },
//   //       pdfBase64: {
//   //         type: 'string',
//   //         description: 'Base64-encoded PDF contents. Use this when the PDF is on the client.'
//   //       }
//   //     },
//   //     oneOf: [
//   //       { required: ['uploadId'] },
//   //       { required: ['pdfPath'] },
//   //       { required: ['pdfBase64'] }
//   //     ]
//   //   }
//   // },
//   {
//   name: 'extract_column_schedule',

//   description:
//     'Extract a column schedule from a PDF. For PDFs supplied by the client, use uploadId or pdfBase64. Do NOT use a client-local filesystem path such as /mnt/user-data/uploads/. pdfPath is only for a PDF that physically exists on the MCP server.',

//   inputSchema: {

//     type: 'object',

//     properties: {

//       uploadId: {

//         type: 'string',

//         description:
//           'Temporary PDF upload ID returned by POST /api/pdf/uploads. Preferred when the PDF has been uploaded to this MCP server.'

//       },

//       pdfBase64: {

//         type: 'string',

//         description:
//           'Base64-encoded PDF contents. Use when the client can provide the actual PDF bytes.'

//       },

//       pdfPath: {

//         type: 'string',

//         description:
//           'Path to a PDF physically stored on the MCP server. Do not use client-local paths such as /mnt/user-data/uploads/.'

//       }

//     },

//     oneOf: [

//       {
//         required: ['uploadId']
//       },

//       {
//         required: ['pdfBase64']
//       },

//       {
//         required: ['pdfPath']
//       }

//     ]

//   }

// },

//   {
//     name: 'process_column_schedule',
//     description:
//       'Normalize extracted column-schedule JSON into tabular records.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         json: {
//           description: 'JSON object or JSON string to process.'
//         },
//         jsonPath: {
//           type: 'string',
//           description: 'Optional path to a JSON file instead of passing json inline.'
//         }
//       }
//     }
//   },

//   {
//     name: 'export_coord_schedule_excel',
//     description:
//       'Convert coordinate-based JSON into an Excel workbook and CSV. Returns download URLs for both files.',
//     inputSchema: {
//       type: 'object',
//       properties: {
//         json: {
//           description: 'JSON object or JSON string to convert.'
//         },
//         jsonPath: {
//           type: 'string',
//           description: 'Optional path to a JSON file instead of passing json inline.'
//         },
//         outputPath: {
//           type: 'string',
//           description: 'Optional output path for the resulting XLSX file.'
//         },
//         sourceName: {
//           type: 'string',
//           description: 'Optional base name for the outputs (defaults to the JSON filename).'
//         }
//       }
//     }
//   }
// ];

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

// function parseJsonInput(value, label) {
//   if (value === undefined || value === null || value === '') {
//     throw new Error(`${label} is required.`);
//   }

//   if (typeof value === 'string') {
//     const trimmed = value.trim();

//     if (!trimmed) {
//       throw new Error(`${label} is required.`);
//     }

//     try {
//       return JSON.parse(trimmed);
//     } catch (error) {
//       throw new Error(`Invalid JSON for ${label}: ${error.message}`);
//     }
//   }

//   return value;
// }

// // function decodePdfBase64(value) {
// //   if (typeof value !== 'string' || !value.trim()) {
// //     throw new Error('pdfBase64 must be a non-empty base64 string.');
// //   }

// //   const base64 = value.trim().replace(/^data:application\/pdf;base64,/, '');

// //   if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
// //     throw new Error('pdfBase64 is not valid base64.');
// //   }

// //   const buffer = Buffer.from(base64, 'base64');

// //   if (!buffer.length) {
// //     throw new Error('pdfBase64 must contain PDF data.');
// //   }

// //   return buffer;
// // }
// function decodePdfBase64(value) {
//   if (typeof value !== 'string' || !value.trim()) {
//     throw new Error('pdfBase64 must be a non-empty base64 string.');
//   }

//   // ---- 1. strip data-URI prefix ----
//   let base64 = value
//     .trim()
//     .replace(/^data:application\/pdf;base64,/, '');

//   // ---- 2. log diagnostics on the RAW input ----
//   console.log('[PDF][b64] raw length:', base64.length);
//   console.log('[PDF][b64] length % 4:', base64.length % 4);
//   console.log('[PDF][b64] head:', JSON.stringify(base64.slice(0, 40)));
//   console.log('[PDF][b64] tail:', JSON.stringify(base64.slice(-40)));
//   console.log('[PDF][b64] has whitespace:', /\s/.test(base64));
//   console.log('[PDF][b64] has url-safe chars (- or _):', /[-_]/.test(base64));
//   console.log('[PDF][b64] has invalid chars:', /[^A-Za-z0-9+/=]/.test(base64));

//   // ---- 3. normalize: strip whitespace, convert url-safe ----
//   base64 = base64
//     .replace(/\s+/g, '')          // remove \n, \r, spaces, tabs
//     .replace(/-/g, '+')           // url-safe -> standard
//     .replace(/_/g, '/');

//   // ---- 4. fix padding if missing (length % 4 === 2 or 3) ----
//   if (base64.length % 4 === 2) {
//     base64 += '==';
//   } else if (base64.length % 4 === 3) {
//     base64 += '=';
//   }

//   // ---- 5. lenient validation ----
//   // Accept standard base64 with optional padding.
//   // Reject only if there is obviously garbage in the middle.
//   if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
//     console.error('[PDF][b64] validation failed.');
//     console.error('[PDF][b64] normalized length:', base64.length);
//     console.error('[PDF][b64] offending chars:',
//       (base64.match(/[^A-Za-z0-9+/=]/g) || []).slice(0, 20)
//     );
//     console.error('[PDF][b64] head:', JSON.stringify(base64.slice(0, 80)));
//     console.error('[PDF][b64] tail:', JSON.stringify(base64.slice(-80)));

//     throw new Error(
//       'pdfBase64 is not valid base64 (after normalization). ' +
//       'See server logs for the offending characters.'
//     );
//   }

//   // ---- 6. decode ----
//   const buffer = Buffer.from(base64, 'base64');

//   console.log('[PDF][b64] normalized length:', base64.length);
//   console.log('[PDF][b64] decoded bytes:', buffer.length);
//   console.log('[PDF][b64] PDF magic:',
//     buffer.slice(0, 5).toString('latin1')  // should be "%PDF-"
//   );

//   if (!buffer.length) {
//     throw new Error('pdfBase64 decoded to an empty buffer.');
//   }

//   if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
//     throw new Error(
//       'Decoded data does not look like a PDF (missing %PDF- header). ' +
//       'Did you base64-encode the wrong file?'
//     );
//   }

//   return buffer;
// }


// // ---------- Helper: derive output basename from whatever the caller sent -----
// function deriveSourceNameFromArgs(args, fallback = "coord-schedule-output") {
//   const stripExt = (n) => String(n).replace(/\.(json|txt|xlsx|csv)$/i, "");

//   if (args && args.sourceName) return stripExt(args.sourceName);
//   if (args && args.jsonPath)   return stripExt(path.basename(String(args.jsonPath)));
//   if (args && args.outputPath) return stripExt(path.basename(String(args.outputPath)));
//   return fallback;
// }

// export async function callTool(
//   sessionId,
//   name,
//   args = {}
// ) {
//   let result;

//   switch (name) {

//     case 'get_projects':
//       result = await core.getProjects(
//         sessionId
//       );
//       break;

//     case 'get_project':
//       result = await core.getProject(
//         sessionId,
//         args.projectId
//       );
//       break;

//     case 'get_folders':
//       result = await core.getFolders(
//         sessionId,
//         args.projectId
//       );
//       break;

//     case 'get_issues':
//       result = await topics.getTopics(
//         sessionId,
//         args.projectId
//       );
//       break;

//     case 'get_property_set_current_user':
//       result = await propertySet.getCurrentUser(sessionId);
//       break;

//     case 'list_property_set_libraries':
//       result = await propertySet.getLibraries(sessionId);
//       break;

//     case 'create_property_set_library':
//       result = await propertySet.createLibrary(sessionId, args.library);
//       break;

//     case 'get_property_set_library':
//       result = await propertySet.getLibrary(sessionId, args.libId);
//       break;

//     case 'update_property_set_library':
//       result = await propertySet.updateLibrary(sessionId, args.libId, args.updates);
//       break;

//     case 'delete_property_set_library':
//       result = await propertySet.deleteLibrary(sessionId, args.libId);
//       break;

//     case 'list_property_set_definitions':
//       result = await propertySet.listDefinitions(sessionId, args.libId, args.query || {});
//       break;

//     case 'create_property_set_definition':
//       result = await propertySet.createDefinition(sessionId, args.libId, args.definition);
//       break;

//     case 'get_property_set_definition':
//       result = await propertySet.getDefinition(sessionId, args.libId, args.defId);
//       break;

//     case 'update_property_set_definition':
//       result = await propertySet.updateDefinition(sessionId, args.libId, args.defId, args.updates);
//       break;

//     case 'delete_property_set_definition':
//       result = await propertySet.deleteDefinition(sessionId, args.libId, args.defId);
//       break;

//     case 'validate_property_set_values':
//       result = await propertySet.validateValues(sessionId, args.libId, args.defId, args.values);
//       break;

//     case 'list_property_set_instances_by_definition':
//       result = await propertySet.listPsetsByDefinition(sessionId, args.libId, args.defId);
//       break;

//     case 'list_property_set_instances_for_link':
//       result = await propertySet.listPsetsForLink(sessionId, args.link, args.query || {});
//       break;

//     case 'get_property_set_instance':
//       result = await propertySet.getPset(sessionId, args.link, args.libId, args.defId);
//       break;

//     case 'update_property_set_instance':
//       result = await propertySet.updatePset(sessionId, args.link, args.libId, args.defId, args.props);
//       break;

//     case 'delete_property_set_instance':
//       result = await propertySet.deletePset(sessionId, args.link, args.libId, args.defId);
//       break;

//     case 'batch_get_property_sets':
//       result = await propertySet.batchGetPsets(sessionId, args.psets);
//       break;

//     case 'apply_property_set_changeset':
//       result = await propertySet.applyChangeset(sessionId, args.changeset);
//       break;

//     case 'apply_property_set_changeset_async':
//       result = await propertySet.applyChangesetAsync(sessionId, args.changeset);
//       break;

//     case 'get_property_set_changeset_status':
//       result = await propertySet.getChangesetStatus(sessionId, args.changesetId);
//       break;

//     // case 'extract_column_schedule': {
//     //   const uploadId = args.uploadId;
//     //   const pdfPath = args.pdfPath;
//     //   const pdfBase64 = args.pdfBase64;

//     //   if (!uploadId && !pdfPath && !pdfBase64) {
//     //     throw new Error('Either uploadId, pdfPath, or pdfBase64 is required.');
//     //   }

//     //   if ([uploadId, pdfPath, pdfBase64].filter(Boolean).length > 1) {
//     //     throw new Error('Provide only one of uploadId, pdfPath, or pdfBase64.');
//     //   }

//     //   result = uploadId
//     //     ? await extractColumnScheduleFromBuffer(
//     //         (await getPdfUpload(uploadId)).buffer
//     //       )
//     //     : pdfBase64
//     //     ? await extractColumnScheduleFromBuffer(
//     //         decodePdfBase64(pdfBase64)
//     //       )
//     //     : await extractColumnScheduleFromPdf(pdfPath);
//     //   break;
//     // }
//     case 'extract_column_schedule': {

//   const uploadId =
//     args.uploadId;

//   const pdfPath =
//     args.pdfPath;

//   const pdfBase64 =
//     args.pdfBase64;


//   // ==========================================
//   // VALIDATE INPUT
//   // ==========================================

//   const suppliedInputs =
//     [
//       uploadId,
//       pdfPath,
//       pdfBase64
//     ].filter(
//       value =>
//         value !== undefined &&
//         value !== null &&
//         value !== ''
//     );


//   if (
//     suppliedInputs.length === 0
//   ) {

//     throw new Error(
//       'PDF input is required. Provide uploadId, pdfBase64, or a server-side pdfPath.'
//     );

//   }


//   if (
//     suppliedInputs.length > 1
//   ) {

//     throw new Error(
//       'Provide only one of uploadId, pdfBase64, or pdfPath.'
//     );

//   }


//   // ==========================================
//   // REJECT CLIENT-LOCAL PATHS
//   // ==========================================

//   if (pdfPath) {

//     const normalizedPath =
//       pdfPath
//         .replace(/\\/g, '/')
//         .toLowerCase();


//     if (
//       normalizedPath.startsWith(
//         '/mnt/user-data/'
//       ) ||
//       normalizedPath.startsWith(
//         '/mnt/data/'
//       ) ||
//       normalizedPath.startsWith(
//         '/users/'
//       ) ||
//       /^[a-z]:\//.test(
//         normalizedPath
//       )
//     ) {

//       throw new Error(
//         'The supplied pdfPath is a client-local path and cannot be accessed by the MCP server. Upload the PDF first and provide uploadId, or provide pdfBase64.'
//       );

//     }

//   }


//   // ==========================================
//   // UPLOAD ID
//   // ==========================================

//   if (uploadId) {

//     console.log(
//       '[PDF] Extracting from uploadId:',
//       uploadId
//     );

//     const upload =
//       await getPdfUpload(
//         uploadId
//       );

//     console.log(
//       '[PDF] Uploaded PDF:',
//       upload.originalname
//     );

//     console.log(
//       '[PDF] Buffer size:',
//       upload.buffer.length
//     );

//     result =
//       await extractColumnScheduleFromBuffer(
//         upload.buffer
//       );

//     break;

//   }


//   // ==========================================
//   // BASE64
//   // ==========================================

//   if (pdfBase64) {

//     console.log(
//       '[PDF] Extracting from Base64'
//     );

//     console.log(
//       '[PDF] Base64 length:',
//       pdfBase64.length
//     );

//     const buffer =
//       decodePdfBase64(
//         pdfBase64
//       );

//     console.log(
//       '[PDF] Decoded PDF size:',
//       buffer.length
//     );

//     result =
//       await extractColumnScheduleFromBuffer(
//         buffer
//       );

//     break;

//   }


//   // ==========================================
//   // SERVER-SIDE PDF PATH
//   // ==========================================

//   console.log(
//     '[PDF] Extracting from server path:',
//     pdfPath
//   );

//   result =
//     await extractColumnScheduleFromPdf(
//       pdfPath
//     );

//   break;

// }

//     case 'process_column_schedule': {
//       let jsonValue = args.json;

//       if (!jsonValue && args.jsonPath) {
//         const jsonFile = path.resolve(args.jsonPath);

//         if (!fs.existsSync(jsonFile)) {
//           throw new Error(`JSON file not found: ${jsonFile}`);
//         }

//         jsonValue = fs.readFileSync(jsonFile, 'utf8');
//       }

//       const payload = parseJsonInput(jsonValue, 'json');
//       result = processColumnSchedule(payload);
//       break;
//     }

//     case 'export_coord_schedule_excel': {

//       // 1. Load JSON -----------------------------------------------------
//       let jsonValue = args.json;

//       if (!jsonValue && args.jsonPath) {
//         const jsonFile = path.resolve(args.jsonPath);

//         if (!fs.existsSync(jsonFile)) {
//           throw new Error(`JSON file not found: ${jsonFile}`);
//         }

//         jsonValue = fs.readFileSync(jsonFile, 'utf8');
//       }

//       const payload = parseJsonInput(jsonValue, 'json');

//       // 2. Filename follows the JSON file ---------------------------------
//       const sourceName = deriveSourceNameFromArgs(args);

//       console.log('[export_coord_schedule_excel] sourceName =', sourceName);
//       console.log('[export_coord_schedule_excel] args.jsonPath =', args.jsonPath);

//       // 3. Output directory ----------------------------------------------
//       const outputDir = args.outputPath
//         ? path.dirname(path.resolve(args.outputPath))
//         : process.cwd();

//       fs.mkdirSync(outputDir, { recursive: true });

//       const finalExcelPath = path.join(outputDir, `${sourceName}.xlsx`);
//       const finalCsvPath   = path.join(outputDir, `${sourceName}.csv`);

//       console.log('[export_coord_schedule_excel] finalExcelPath =', finalExcelPath);
//       console.log('[export_coord_schedule_excel] finalCsvPath   =', finalCsvPath);

//       // 4. Timestamped copies for download URLs ---------------------------
//       const downloadDirectory = path.join(
//         process.cwd(),
//         'src',
//         'pdf',
//         'temp'
//       );
//       fs.mkdirSync(downloadDirectory, { recursive: true });

//       const stamp = Date.now();
//       const excelFilename = `coord-schedule-${stamp}.xlsx`;
//       const csvFilename   = `coord-schedule-${stamp}.csv`;
//       const excelDownloadPath = path.join(downloadDirectory, excelFilename);
//       const csvDownloadPath   = path.join(downloadDirectory, csvFilename);

//       // 5. Generate -------------------------------------------------------
//       result = await generateCoordScheduleWorkbook(
//         payload,
//         finalExcelPath,   // outputPath
//         finalCsvPath,     // csvPath
//         sourceName        // sourceName  ← the JSON-derived name
//       );

//       // 6. Mirror to timestamped downloads --------------------------------
//       fs.copyFileSync(finalExcelPath, excelDownloadPath);
//       if (result.csvFile && fs.existsSync(result.csvFile)) {
//         fs.copyFileSync(result.csvFile, csvDownloadPath);
//       }

//       // 7. Response -------------------------------------------------------
//       const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

//       result = {
//         ...result,
//         csvBuffer: undefined,
//         sourceName,
//         outputFile: finalExcelPath,
//         csvFile: result.csvFile || null,
//         excelDownloadUrl: `${publicBaseUrl}/api/pdf/downloads/${excelFilename}`,
//         csvDownloadUrl: result.csvFile
//           ? `${publicBaseUrl}/api/pdf/downloads/${csvFilename}`
//           : null
//       };
//       break;
//     }

//     default:
//       throw new Error(
//         `Unknown tool: ${name}`
//       );
//   }

//   return {
//     content: [
//       {
//         type: 'text',
//         text: JSON.stringify(
//           result,
//           null,
//           2
//         )
//       }
//     ]
//   };
// }
