import fs from 'node:fs';
import path from 'node:path';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  topics
} from '../trimble/index.js';

import {
  extractColumnScheduleFromPdf,
  extractColumnScheduleFromBuffer
} from '../pdf/extractColumnSchedule.js';

import {
  generateCoordScheduleWorkbook
} from '../pdf/coordScheduleExporter.js';

import {
  processColumnSchedule
} from '../pdf/columnScheduleExporter.js';

import {
  getPdfUpload
} from '../pdf/pdf.js';

export const definitions = [
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
    name: 'extract_column_schedule',
    description:
      'Extract raw PDF column-schedule items from a PDF file path on the server.',
    inputSchema: {
      type: 'object',
      properties: {
        uploadId: {
          type: 'string',
          description: 'Temporary PDF upload ID returned by POST /api/pdf/uploads.'
        },
        pdfPath: {
          type: 'string',
          description: 'Absolute or relative path to a PDF file on the MCP server.'
        },
        pdfBase64: {
          type: 'string',
          description: 'Base64-encoded PDF contents. Use this when the PDF is on the client.'
        }
      },
      oneOf: [
        { required: ['uploadId'] },
        { required: ['pdfPath'] },
        { required: ['pdfBase64'] }
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
      'Convert coordinate-based JSON into an Excel workbook.',
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
        }
      }
    }
  }
];

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

  const base64 = value.trim().replace(/^data:application\/pdf;base64,/, '');

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error('pdfBase64 is not valid base64.');
  }

  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    throw new Error('pdfBase64 must contain PDF data.');
  }

  return buffer;
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

    case 'extract_column_schedule': {
      const uploadId = args.uploadId;
      const pdfPath = args.pdfPath;
      const pdfBase64 = args.pdfBase64;

      if (!uploadId && !pdfPath && !pdfBase64) {
        throw new Error('Either uploadId, pdfPath, or pdfBase64 is required.');
      }

      if ([uploadId, pdfPath, pdfBase64].filter(Boolean).length > 1) {
        throw new Error('Provide only one of uploadId, pdfPath, or pdfBase64.');
      }

      result = uploadId
        ? await extractColumnScheduleFromBuffer(
            getPdfUpload(uploadId).buffer
          )
        : pdfBase64
        ? await extractColumnScheduleFromBuffer(
            decodePdfBase64(pdfBase64)
          )
        : await extractColumnScheduleFromPdf(pdfPath);
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
      let jsonValue = args.json;

      if (!jsonValue && args.jsonPath) {
        const jsonFile = path.resolve(args.jsonPath);

        if (!fs.existsSync(jsonFile)) {
          throw new Error(`JSON file not found: ${jsonFile}`);
        }

        jsonValue = fs.readFileSync(jsonFile, 'utf8');
      }

      const payload = parseJsonInput(jsonValue, 'json');
      const outputPath = args.outputPath
        ? path.resolve(args.outputPath)
        : path.join(process.cwd(), 'coord-schedule-output.xlsx');

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      result = await generateCoordScheduleWorkbook(payload, outputPath);

      result = {
        ...result,
        csvBuffer: undefined
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
