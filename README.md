# Trimble Connect MCP — Render + Firebase

Node.js MCP server and OAuth backend for Trimble Connect, with a Firebase-hosted extension UI and optional local Tekla and SketchUp bridges.

## Architecture
- GitHub: source control
- Render: Node.js MCP + OAuth backend
- Firebase Hosting: Trimble Connect extension frontend
- Trimble Identity: per-user OAuth
- Trimble Connect API: user-authorized data
- Anthropic API: optional Claude orchestration

## MCP connector setup

For Trimble Agent Studio or another remote MCP client, use the deployed MCP
endpoint, including the `/mcp` path:

```text
https://YOUR-RENDER-SERVICE.onrender.com/mcp
```

For this deployment, the endpoint is:

```text
https://trimble-claude-mcp-g86i.onrender.com/mcp
```

The MCP `initialize`, `notifications/initialized`, and `tools/list` requests
are accepted without a user session so a connector can complete its handshake
and discover tools. Tool execution (`tools/call`) still requires authentication
through the configured OAuth/session flow. The server advertises protected
resource and authorization-server metadata at `/.well-known/oauth-protected-resource`
and `/.well-known/oauth-authorization-server`; it also supports the MCP
protected-resource discovery paths ending in `/mcp`.

Set `PUBLIC_BASE_URL` in Render to the public HTTPS origin, without a trailing
slash, for example `https://YOUR-RENDER-SERVICE.onrender.com`. OAuth discovery,
callback URLs, resource identifiers, and generated download links rely on this
value. Set `TRIMBLE_REDIRECT_URI` to
`https://YOUR-RENDER-SERVICE.onrender.com/oauth/callback` and register that
same callback URL in the Trimble application.

`TRIMBLE_SCOPE` controls the scopes requested from Trimble Identity and defaults
to `openid profile email`. Those are upstream Trimble OAuth scopes, not
MCP-specific scopes advertised by this server. If Agent Studio has a separate
scope field, follow its connector requirements; this server does not publish
an MCP scope list. Whether a Trimble Agent Studio tenant permits a particular
hosting domain is controlled by Trimble policy, not by this server.

The MCP/OAuth endpoints support cross-origin connector requests. Other API and
extension routes retain the configured `EXTENSION_ORIGIN` CORS policy.

## Available integrations

The MCP tool catalog includes Trimble Connect operations for users, regions,
projects, folders, files, models and entities, groups, organizer todos/views,
property sets, BCF issues/topics and related resources, and Status Sharing.
It also includes PDF schedule extraction/export, tender extraction, Python
testing, workspace workflows, and bridge selection. Tekla and SketchUp tools
are available through their respective local bridge integrations; a deployed
Render service cannot directly reach software running on a user's workstation
without a reachable bridge or relay.

## Important production notes
1. The included session store is intentionally in-memory for development. Replace it with Firestore, Redis, or PostgreSQL before multi-instance production.
2. Set `FIREBASE_STORAGE_BUCKET` in Render to enable shared temporary PDF uploads across restarts and instances. Uploads expire after 15 minutes.
3. Set `PUBLIC_BASE_URL` and `TRIMBLE_REDIRECT_URI` to the deployed HTTPS URLs described above.
4. Verify the Trimble OAuth endpoints and requested `TRIMBLE_SCOPE` against your registered Trimble application.
5. Do not commit `.env` or secrets.
6. MCP initialization and tool discovery are unauthenticated, but tool calls are protected. Keep the OAuth configuration and token/session storage secure.
7. The Firebase UI is a starter shell. Replace placeholder service URLs and wire chat orchestration to your desired Claude/MCP flow.

## Local run
```bash
npm install
SESSION_SECRET=replace-with-a-long-random-value npm start
```
Open `http://localhost:3000/health`.

The Workflow Builder's **Save workflow** and **Load workflow** buttons store
the current workflow in `pages/datastorage/workflowbuilder.json` on the server.
These actions require Trimble sign-in. The saved file is server-side storage;
on hosts with an ephemeral filesystem, it may not survive a restart or
redeployment unless persistent storage is configured.

For Trimble Connect OAuth locally, configure `TRIMBLE_CLIENT_ID`,
`TRIMBLE_CLIENT_SECRET`, `TRIMBLE_AUTHORIZATION_ENDPOINT`, `TRIMBLE_TOKEN_ENDPOINT`,
`TRIMBLE_REDIRECT_URI`, and `PUBLIC_BASE_URL` in the environment. `TRIMBLE_SCOPE`
is optional and defaults to `openid profile email`.

## SketchUp status bridge

The optional SketchUp Ruby bridge is in `sketchup/SUBridge.rb`. In SketchUp,
open **Window > Ruby Console**, paste the file contents, and run it. It starts
a loopback-only HTTP server at `http://127.0.0.1:43127/status` and evaluates
SketchUp model state on SketchUp's UI thread.

Check it locally with:

```bash
curl http://127.0.0.1:43127/status
```

This endpoint is a status bridge only. It does not implement MCP tool listing
or tool calls. The existing MCP integration uses
`@parkhill/mcp-server-for-sketchup` on port `9876`; keep that backend running
when using the `sketchup_*` MCP tools. A deployed Render service cannot reach a
desktop SketchUp instance through `127.0.0.1`; use a local Node service or an
authenticated tunnel/relay for that topology.

## Extract a client-side PDF
The `extract_column_schedule` MCP tool accepts either a server-visible `pdfPath` or
the PDF contents as `pdfBase64` when the file exists on the client:

```json
{
	"name": "extract_column_schedule",
	"arguments": {
		"pdfBase64": "JVBERi0x..."
	}
}
```

The base64 value may also be a `data:application/pdf;base64,...` value. Do not
send both `pdfPath` and `pdfBase64` in the same request.

For a browser, Swagger, or another upload client, first POST the PDF as the
`file` field to `/api/pdf/uploads`. The response contains a temporary `uploadId`
that can be passed to the MCP tool:

```json
{
	"name": "extract_column_schedule",
	"arguments": {
		"uploadId": "returned-upload-id"
	}
}
```

The existing `/api/pdf/extract-column-schedule` endpoint remains available for
the HTML exporter and extracts the uploaded file directly in the same request.

## GitHub
```bash
git init
git add .
git commit -m "Initial Trimble Claude MCP"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/trimble-claude-mcp.git
git push -u origin main
```

## Render
Connect the GitHub repository as a Web Service or use `render.yaml` as a Blueprint. Build: `npm install`; Start: `npm start`.
Set the required `SESSION_SECRET` and Trimble OAuth variables in Render. Set
`PUBLIC_BASE_URL` to the public service origin. Set `TRIMBLE_REDIRECT_URI` to:
`https://YOUR-RENDER-NAME.onrender.com/oauth/callback`

## Firebase
```bash
firebase login
firebase init hosting
firebase deploy
```
Use `public` as the hosting directory. Replace the Render URL in `public/index.html`.

## Production follow-up
- Firestore token/session persistence with encryption at rest
- Validate the MCP HTTP transport against the client versions you intend to support
- Rate limiting, CSRF protection, audit logging, and structured logging
- Trimble Connect extension SDK context and selected-object integration
"# trimble-claude-mcp" 
