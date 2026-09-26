import {
  trimbleRequest
} from './client.js';

function queryString(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      params.set(
        key,
        String(value)
      );
    }
  }

  const result = params.toString();

  return result
    ? `?${result}`
    : '';
}

export const core = {

  getCurrentUser(sessionId) {
    return trimbleRequest(
      sessionId,
      '/users/me'
    );
  },

  getRegions(sessionId) {
    return trimbleRequest(
      sessionId,
      '/regions'
    );
  },

  getProjects(
    sessionId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects${queryString(query)}`
    );
  },

  getProject(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}`
    );
  },

  getFolders(
    sessionId,
    projectId,
    query = {}
  ) {
    // Trimble Connect has no /projects/{id}/folders route — resolve the
    // project's root folder and list its subfolder items instead.
    return core
      .getProject(sessionId, projectId)
      .then((project) =>
        core.getSubfolders(sessionId, project.rootId || project.id, query)
      );
  },

  getFiles(
    sessionId,
    projectId,
    query = {}
  ) {
    // Trimble Connect has no /projects/{id}/files route — resolve the
    // project's root folder and list its file items instead.
    return core
      .getProject(sessionId, projectId)
      .then((project) =>
        core.getFolderFiles(sessionId, project.rootId || project.id, query)
      );
  },

  // ---------- USERS ----------

  getUser(
    sessionId,
    userId
  ) {
    return trimbleRequest(
      sessionId,
      `/users/${encodeURIComponent(userId)}`
    );
  },

  // ---------- PROJECTS ----------

  createProject(
    sessionId,
    project
  ) {
    return trimbleRequest(
      sessionId,
      '/projects',
      {
        method: 'POST',
        body: project
      }
    );
  },

  updateProject(
    sessionId,
    projectId,
    updates
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteProject(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  getProjectMembers(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/members`
    );
  },

  // ---------- FOLDERS ----------

  getFolder(
    sessionId,
    folderId
  ) {
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}`
    );
  },

  createFolder(
    sessionId,
    projectId,
    folder
  ) {
    // Folder creation is a top-level POST /folders call — the parent is set
    // via parentId in the body, not a nested /folders/{id}/folders route.
    return core
      .getProject(sessionId, projectId)
      .then((project) =>
        trimbleRequest(
          sessionId,
          '/folders',
          {
            method: 'POST',
            body: {
              parentId: project.rootId || project.id,
              ...folder
            }
          }
        )
      );
  },

  updateFolder(
    sessionId,
    folderId,
    updates
  ) {
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteFolder(
    sessionId,
    folderId
  ) {
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  getSubfolders(
    sessionId,
    folderId,
    query = {}
  ) {
    // /folders/{id}/folders does not exist — list combined items and filter.
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}/items${queryString({ ...query, type: 'folder' })}`
    );
  },

  getFolderFiles(
    sessionId,
    folderId,
    query = {}
  ) {
    // /folders/{id}/files does not exist — list combined items and filter.
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}/items${queryString({ ...query, type: 'file' })}`
    );
  },

  // ---------- FILES ----------

  getFile(
    sessionId,
    fileId
  ) {
    return trimbleRequest(
      sessionId,
      `/files/${encodeURIComponent(fileId)}`
    );
  },

  updateFile(
    sessionId,
    fileId,
    updates
  ) {
    return trimbleRequest(
      sessionId,
      `/files/${encodeURIComponent(fileId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteFile(
    sessionId,
    fileId
  ) {
    return trimbleRequest(
      sessionId,
      `/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  getFileVersions(
    sessionId,
    fileId
  ) {
    return trimbleRequest(
      sessionId,
      `/files/${encodeURIComponent(fileId)}/versions`
    );
  },

  createFileVersion(
    sessionId,
    fileId,
    version
  ) {
    return trimbleRequest(
      sessionId,
      `/files/${encodeURIComponent(fileId)}/versions`,
      {
        method: 'POST',
        body: version
      }
    );
  },

  // ---------- TODOS ----------

  getTodos(
    sessionId,
    projectId,
    query = {}
  ) {
    // Todos are a top-level collection filtered by projectId, not nested
    // under /projects/{id}/todos (that route does not exist).
    return trimbleRequest(
      sessionId,
      `/todos${queryString({ ...query, projectId })}`
    );
  },

  getTodo(
    sessionId,
    todoId
  ) {
    return trimbleRequest(
      sessionId,
      `/todos/${encodeURIComponent(todoId)}`
    );
  },

  createTodo(
    sessionId,
    projectId,
    todo
  ) {
    return trimbleRequest(
      sessionId,
      '/todos',
      {
        method: 'POST',
        body: {
          projectId,
          ...todo
        }
      }
    );
  },

  updateTodo(
    sessionId,
    todoId,
    updates
  ) {
    return trimbleRequest(
      sessionId,
      `/todos/${encodeURIComponent(todoId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteTodo(
    sessionId,
    todoId
  ) {
    return trimbleRequest(
      sessionId,
      `/todos/${encodeURIComponent(todoId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  // ---------- VIEWS ----------

  getViews(
    sessionId,
    projectId,
    query = {}
  ) {
    // Views are a top-level collection filtered by projectId, not nested
    // under /projects/{id}/views (that route does not exist).
    return trimbleRequest(
      sessionId,
      `/views${queryString({ ...query, projectId })}`
    );
  },

  getView(
    sessionId,
    viewId
  ) {
    return trimbleRequest(
      sessionId,
      `/views/${encodeURIComponent(viewId)}`
    );
  },

  createView(
    sessionId,
    projectId,
    view
  ) {
    return trimbleRequest(
      sessionId,
      '/views',
      {
        method: 'POST',
        body: {
          projectId,
          ...view
        }
      }
    );
  },

  // ---------- SEARCH ----------

  search(
    sessionId,
    projectId,
    query = {}
  ) {
    // Search is a top-level collection filtered by projectId, not nested
    // under /projects/{id}/search (that route does not exist).
    return trimbleRequest(
      sessionId,
      `/search${queryString({ ...query, projectId })}`
    );
  }

};