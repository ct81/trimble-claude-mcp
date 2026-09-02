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
  extractColumnScheduleFromPdf
} from '../pdf/extractColumnSchedule.js';

import {
  generateCoordScheduleWorkbook
} from '../pdf/coordScheduleExporter.js';

import {
  processColumnSchedule
} from '../pdf/columnScheduleExporter.js';

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
        pdfPath: {
          type: 'string',
          description: 'Absolute or relative path to the PDF file.'
        }
      },
      required: ['pdfPath']
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
      const pdfPath = args.pdfPath;

      if (!pdfPath) {
        throw new Error('pdfPath is required.');
      }

      result = await extractColumnScheduleFromPdf(pdfPath);
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
