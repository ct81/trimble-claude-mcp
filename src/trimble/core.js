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
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/folders${queryString(query)}`
    );
  },

  getFiles(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/files${queryString(query)}`
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

  getProjectThumbnail(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/thumbnail`
    );
  },

  getProjectPermissions(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/permissions`
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
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/folders`,
      {
        method: 'POST',
        body: folder
      }
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
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}/folders${queryString(query)}`
    );
  },

  getFolderFiles(
    sessionId,
    folderId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/folders/${encodeURIComponent(folderId)}/files${queryString(query)}`
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

  getVersion(
    sessionId,
    versionId
  ) {
    return trimbleRequest(
      sessionId,
      `/versions/${encodeURIComponent(versionId)}`
    );
  },

  getVersionContent(
    sessionId,
    versionId
  ) {
    return trimbleRequest(
      sessionId,
      `/versions/${encodeURIComponent(versionId)}/content`
    );
  },

  // ---------- TODOS ----------

  getTodos(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/todos${queryString(query)}`
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
      `/projects/${encodeURIComponent(projectId)}/todos`,
      {
        method: 'POST',
        body: todo
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

  getTodoComments(
    sessionId,
    todoId
  ) {
    return trimbleRequest(
      sessionId,
      `/todos/${encodeURIComponent(todoId)}/comments`
    );
  },

  createTodoComment(
    sessionId,
    todoId,
    comment
  ) {
    return trimbleRequest(
      sessionId,
      `/todos/${encodeURIComponent(todoId)}/comments`,
      {
        method: 'POST',
        body: comment
      }
    );
  },

  // ---------- VIEWS ----------

  getViews(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/views${queryString(query)}`
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
      `/projects/${encodeURIComponent(projectId)}/views`,
      {
        method: 'POST',
        body: view
      }
    );
  },

  // ---------- SEARCH ----------

  search(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/search${queryString(query)}`
    );
  }

};