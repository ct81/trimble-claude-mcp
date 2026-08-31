// import { tools as trimble } from '../trimble/client.js';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  topics
} from '../trimble/index.js';

export const tools = {

  // ==========================================
  // CURRENT USER
  // ==========================================

  getCurrentUser: async (sessionId) => {
    return await core.getCurrentUser(sessionId);
  },


  // ==========================================
  // REGIONS
  // ==========================================

  getRegions: async (sessionId) => {
    return await core.getRegions(sessionId);
  },


  // ==========================================
  // PROJECTS
  // ==========================================

  getProjects: async (
    sessionId,
    query = {}
  ) => {
    return await core.getProjects(
      sessionId,
      query
    );
  },


  getProject: async (
    sessionId,
    projectId
  ) => {
    return await core.getProject(
      sessionId,
      projectId
    );
  },


  // ==========================================
  // FOLDERS
  // ==========================================

  getFolders: async (
    sessionId,
    projectId,
    query = {}
  ) => {
    return await core.getFolders(
      sessionId,
      projectId,
      query
    );
  },


  // ==========================================
  // FILES
  // ==========================================

  getFiles: async (
    sessionId,
    projectId,
    query = {}
  ) => {
    return await core.getFiles(
      sessionId,
      projectId,
      query
    );
  },


  // ==========================================
  // MODEL
  // ==========================================

  getModel: async (
    sessionId,
    projectId,
    modelId
  ) => {
    return await model.getModel(
      sessionId,
      projectId,
      modelId
    );
  },


  getEntities: async (
    sessionId,
    projectId,
    modelId,
    query = {}
  ) => {
    return await model.getEntities(
      sessionId,
      projectId,
      modelId,
      query
    );
  },


  // ==========================================
  // MODEL FEATURE
  // ==========================================

  getGroups: async (
    sessionId,
    projectId
  ) => {
    return await modelFeature.getGroups(
      sessionId,
      projectId
    );
  },


  getGroup: async (
    sessionId,
    projectId,
    groupId
  ) => {
    return await modelFeature.getGroup(
      sessionId,
      projectId,
      groupId
    );
  },


  // ==========================================
  // PROPERTY SET
  // ==========================================

  getPropertySetLibraries: async (
    sessionId,
    projectId
  ) => {
    return await propertySet.getLibraries(
      sessionId,
      projectId
    );
  },


  // ==========================================
  // TOPICS
  // ==========================================

  getTopics: async (
    sessionId,
    projectId,
    query = {}
  ) => {
    return await topics.getTopics(
      sessionId,
      projectId,
      query
    );
  },


  getTopic: async (
    sessionId,
    projectId,
    topicId
  ) => {
    return await topics.getTopic(
      sessionId,
      projectId,
      topicId
    );
  }

};

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
