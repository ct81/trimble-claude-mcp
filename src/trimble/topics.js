import {
  trimbleRequest
} from './client.js';

// Topics (issues/BCF) live on a separate regional "topic-api" service using
// the BCF 2.1 REST shape — /projects/{id}/topics does not exist on tc-api.
const TOPIC_BASE_URL =
  process.env.TRIMBLE_TOPIC_BASE_URL ||
  'https://open11.connect.trimble.com/bcf/2.1/';

function topicRequest(sessionId, path, options = {}) {
  return trimbleRequest(sessionId, path, {
    ...options,
    baseUrl: TOPIC_BASE_URL
  });
}

export const topics = {

  getTopics(
    sessionId,
    projectId,
    query = {}
  ) {
    const params =
      new URLSearchParams(query);

    const suffix =
      params.toString()
        ? `?${params}`
        : '';

    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics${suffix}`
    );
  },

  getTopic(
    sessionId,
    projectId,
    topicId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}`
    );
  },

  createTopic(
    sessionId,
    projectId,
    topic
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics`,
      {
        method: 'POST',
        body: topic
      }
    );
  },

  updateTopic(
    sessionId,
    projectId,
    topicId,
    updates
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  // ---------- COMMENTS ----------

  getComments(
    sessionId,
    projectId,
    topicId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/comments`
    );
  },

  getComment(
    sessionId,
    projectId,
    topicId,
    commentId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`
    );
  },

  createComment(
    sessionId,
    projectId,
    topicId,
    comment
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/comments`,
      {
        method: 'POST',
        body: comment
      }
    );
  },

  updateComment(
    sessionId,
    projectId,
    topicId,
    commentId,
    updates
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteComment(
    sessionId,
    projectId,
    topicId,
    commentId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  // ---------- VIEWPOINTS ----------

  getViewpoints(
    sessionId,
    projectId,
    topicId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints`
    );
  },

  getViewpoint(
    sessionId,
    projectId,
    topicId,
    viewpointId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints/${encodeURIComponent(viewpointId)}`
    );
  },

  createViewpoint(
    sessionId,
    projectId,
    topicId,
    viewpoint
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints`,
      {
        method: 'POST',
        body: viewpoint
      }
    );
  },

  deleteViewpoint(
    sessionId,
    projectId,
    topicId,
    viewpointId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints/${encodeURIComponent(viewpointId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  getViewpointSnapshot(
    sessionId,
    projectId,
    topicId,
    viewpointId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints/${encodeURIComponent(viewpointId)}/snapshot`
    );
  },

  getViewpointBitmap(
    sessionId,
    projectId,
    topicId,
    viewpointId,
    bitmapId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/viewpoints/${encodeURIComponent(viewpointId)}/bitmaps/${encodeURIComponent(bitmapId)}`
    );
  },

  // ---------- DOCUMENT REFERENCES ----------

  getDocumentReferences(
    sessionId,
    projectId,
    topicId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/document_references`
    );
  },

  getDocumentReference(
    sessionId,
    projectId,
    topicId,
    documentReferenceId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/document_references/${encodeURIComponent(documentReferenceId)}`
    );
  },

  createDocumentReference(
    sessionId,
    projectId,
    topicId,
    documentReference
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/document_references`,
      {
        method: 'POST',
        body: documentReference
      }
    );
  },

  updateDocumentReference(
    sessionId,
    projectId,
    topicId,
    documentReferenceId,
    updates
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/document_references/${encodeURIComponent(documentReferenceId)}`,
      {
        method: 'PUT',
        body: updates
      }
    );
  },

  deleteDocumentReference(
    sessionId,
    projectId,
    topicId,
    documentReferenceId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/document_references/${encodeURIComponent(documentReferenceId)}`,
      {
        method: 'DELETE'
      }
    );
  },

  // ---------- RELATED TOPICS ----------

  getRelatedTopics(
    sessionId,
    projectId,
    topicId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/related_topics`
    );
  },

  setRelatedTopics(
    sessionId,
    projectId,
    topicId,
    relatedTopics
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}/related_topics`,
      {
        method: 'PUT',
        body: relatedTopics
      }
    );
  },

  // ---------- PROJECT-LEVEL BCF ----------

  getBcfProjects(sessionId) {
    return topicRequest(
      sessionId,
      '/projects'
    );
  },

  getExtensions(
    sessionId,
    projectId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/extensions`
    );
  },

  getDocuments(
    sessionId,
    projectId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/documents`
    );
  },

  getDocument(
    sessionId,
    projectId,
    documentId
  ) {
    return topicRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`
    );
  },

  getVersion(sessionId) {
    return topicRequest(
      sessionId,
      '/version'
    );
  }

};