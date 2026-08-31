// import { tools as trimble } from '../trimble/client.js';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  topics
} from '../trimble/index.js';

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
  }
];

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

// export const definitions = [
//   { name:'get_projects', description:'List Trimble Connect projects available to the authenticated user.', inputSchema:{type:'object',properties:{}} },
//   { name:'get_project', description:'Get details for a Trimble Connect project.', inputSchema:{type:'object',properties:{projectId:{type:'string'}},required:['projectId']} },
//   { name:'get_folders', description:'List folders for a Trimble Connect project.', inputSchema:{type:'object',properties:{projectId:{type:'string'}},required:['projectId']} },
//   { name:'get_issues', description:'List issues for a Trimble Connect project.', inputSchema:{type:'object',properties:{projectId:{type:'string'}},required:['projectId']} }
// ];

// export async function callTool(sessionId, name, args) {
//   const result = name === 'get_projects' ? await trimble.getProjects(sessionId)
//     : name === 'get_project' ? await trimble.getProject(sessionId, args.projectId)
//     : name === 'get_folders' ? await trimble.getFolders(sessionId, args.projectId)
//     : name === 'get_issues' ? await trimble.getIssues(sessionId, args.projectId)
//     : (() => { throw new Error(`Unknown tool: ${name}`); })();
//   return { content:[{type:'text', text:JSON.stringify(result, null, 2)}] };
// }
