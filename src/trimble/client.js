import { config } from '../config.js';
import { refreshIfNeeded } from '../oauth/oauth.js';

export async function trimbleRequest(sessionId, path, options = {}) {
  const session = await refreshIfNeeded(sessionId);
  if (!session?.trimble?.access_token) throw new Error('No Trimble access token');
  const url = new URL(path, config.trimble.apiBaseUrl.endsWith('/') ? config.trimble.apiBaseUrl : config.trimble.apiBaseUrl + '/');
  const response = await fetch(url, { ...options, headers: { accept:'application/json', ...(options.body ? {'content-type':'application/json'} : {}), ...(options.headers || {}), authorization:`Bearer ${session.trimble.access_token}` } });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  if (!response.ok) throw new Error(`Trimble API ${response.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

export const tools = {
  async getProjects(sessionId) { return trimbleRequest(sessionId, '/projects'); },
  async getProject(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}`); },
  async getFolders(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}/folders`); },
  async getIssues(sessionId, projectId) { return trimbleRequest(sessionId, `/projects/${encodeURIComponent(projectId)}/issues`); }
};
