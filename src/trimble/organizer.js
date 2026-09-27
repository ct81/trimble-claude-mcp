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

export const organizer = {

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
  }

};