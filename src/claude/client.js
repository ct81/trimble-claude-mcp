import { config } from '../config.js';

export async function askClaude(messages, tools = []) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not configured');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST', headers:{'content-type':'application/json','x-api-key':config.anthropicApiKey,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:2000,messages,tools})
  });
  const data = await response.json(); if (!response.ok) throw new Error(`Claude API ${response.status}: ${JSON.stringify(data)}`); return data;
}
