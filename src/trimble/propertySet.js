import { trimbleRequest } from './client.js';

// ================= CONFIG =================
// Property Set Service base URL (regional — verify for your tenant)
const PSET_BASE_URL =
  process.env.TRIMBLE_PSET_BASE_URL ||
  'https://pset-api.ap-southeast-1.connect.trimble.com/v1/';

// Wrapper that injects the PSet base URL override
function psetRequest(sessionId, path, options = {}) {
  return trimbleRequest(sessionId, path, {
    ...options,
    baseUrl: PSET_BASE_URL
  });
}

// Convenience helper for POST bodies
const body = (obj) => ({ method: 'POST', body: obj });

// ================= API =================
export const propertySet = {

  // ---------- USER ----------
  getCurrentUser(sessionId) {
    return psetRequest(sessionId, '/me');
  },

  // ---------- LIBRARIES ----------
  // GET /libs
  getLibraries(sessionId) {
    return psetRequest(sessionId, '/libs');
  },

  // POST /libs
  createLibrary(sessionId, library) {
    return psetRequest(sessionId, '/libs', body(library));
  },

  // GET /libs/{id}
  getLibrary(sessionId, libId) {
    return psetRequest(sessionId, `/libs/${encodeURIComponent(libId)}`);
  },

  // PATCH /libs/{id}
  updateLibrary(sessionId, libId, updates) {
    return psetRequest(sessionId, `/libs/${encodeURIComponent(libId)}`, {
      method: 'PATCH',
      body: updates
    });
  },

  // DELETE /libs/{id}
  deleteLibrary(sessionId, libId) {
    return psetRequest(sessionId, `/libs/${encodeURIComponent(libId)}`, {
      method: 'DELETE'
    });
  },

  // GET /libs/{id}/policy
  getLibraryPolicy(sessionId, libId) {
    return psetRequest(sessionId, `/libs/${encodeURIComponent(libId)}/policy`);
  },

  // PUT /libs/{id}/policy
  setLibraryPolicy(sessionId, libId, policy) {
    return psetRequest(sessionId, `/libs/${encodeURIComponent(libId)}/policy`, {
      method: 'PUT',
      body: policy
    });
  },

  // ---------- DEFINITIONS ----------
  // GET /libs/{id}/defs?top=&skiptoken=&prefix=
  listDefinitions(sessionId, libId, query = {}) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null)
    ).toString();
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs${qs ? `?${qs}` : ''}`
    );
  },

  // POST /libs/{id}/defs
  createDefinition(sessionId, libId, definition) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs`,
      body(definition)
    );
  },

  // GET /libs/{id}/defs/{subId}
  getDefinition(sessionId, libId, defId) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}`
    );
  },

  // PATCH /libs/{id}/defs/{subId}
  updateDefinition(sessionId, libId, defId, updates) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}`,
      { method: 'PATCH', body: updates }
    );
  },

  // DELETE /libs/{id}/defs/{subId}
  deleteDefinition(sessionId, libId, defId) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}`,
      { method: 'DELETE' }
    );
  },

  // GET /libs/{id}/defs/{subId}/versions
  getDefinitionVersions(sessionId, libId, defId) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}/versions`
    );
  },

  // GET /libs/{id}/defs/{subId}/versions/{version}
  getDefinitionVersion(sessionId, libId, defId, version) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}/versions/${version}`
    );
  },

  // GET /libs/{id}/defs/{subId}/schema/{version}
  getDefinitionSchema(sessionId, libId, defId, version) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}/schema/${version}`
    );
  },

  // POST /libs/{id}/defs/{subId}/validate
  validateValues(sessionId, libId, defId, values) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}/validate`,
      body(values)
    );
  },

  // ---------- PSET INSTANCES ----------
  // GET /libs/{id}/defs/{subId}/psets
  listPsetsByDefinition(sessionId, libId, defId) {
    return psetRequest(
      sessionId,
      `/libs/${encodeURIComponent(libId)}/defs/${encodeURIComponent(defId)}/psets`
    );
  },

  // GET /psets/{link}?top=&skiptoken=
  listPsetsForLink(sessionId, link, query = {}) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null)
    ).toString();
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}${qs ? `?${qs}` : ''}`
    );
  },

  // GET /psets/{link}/{libId}/{defId}
  getPset(sessionId, link, libId, defId) {
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}/${encodeURIComponent(libId)}/${encodeURIComponent(defId)}`
    );
  },

  // PATCH /psets/{link}/{libId}/{defId} — body: { props }
  updatePset(sessionId, link, libId, defId, props) {
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}/${encodeURIComponent(libId)}/${encodeURIComponent(defId)}`,
      { method: 'PATCH', body: { props } }
    );
  },

  // DELETE /psets/{link}/{libId}/{defId}
  deletePset(sessionId, link, libId, defId) {
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}/${encodeURIComponent(libId)}/${encodeURIComponent(defId)}`,
      { method: 'DELETE' }
    );
  },

  // GET /psets/{link}/{libId}/{defId}/versions
  getPsetVersions(sessionId, link, libId, defId) {
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}/${encodeURIComponent(libId)}/${encodeURIComponent(defId)}/versions`
    );
  },

  // GET /psets/{link}/{libId}/{defId}/versions/{version}
  getPsetVersion(sessionId, link, libId, defId, version) {
    return psetRequest(
      sessionId,
      `/psets/${encodeURIComponent(link)}/${encodeURIComponent(libId)}/${encodeURIComponent(defId)}/versions/${version}`
    );
  },

  // ---------- BATCH / CHANGESET ----------
  // POST /batch-get — body: { psets: [{ libId, defId, link, v? }] }
  batchGetPsets(sessionId, psets) {
    return psetRequest(sessionId, '/batch-get', body({ psets }));
  },

  // POST /psets/changeset
  applyChangeset(sessionId, changeset) {
    return psetRequest(sessionId, '/psets/changeset', body(changeset));
  },

  // POST /psets/changeset-async
  applyChangesetAsync(sessionId, changeset) {
    return psetRequest(sessionId, '/psets/changeset-async', body(changeset));
  },

  // GET /psets/changeset/{id} — poll async status
  getChangesetStatus(sessionId, changesetId) {
    return psetRequest(
      sessionId,
      `/psets/changeset/${encodeURIComponent(changesetId)}`
    );
  }

};


// import {
//   trimbleRequest
// } from './client.js';

// export const propertySet = {

//   getLibraries(
//     sessionId,
//     projectId
//   ) {
//     return trimbleRequest(
//       sessionId,
//       `/projects/${encodeURIComponent(projectId)}/property-set-libraries`
//     );
//   }

// };