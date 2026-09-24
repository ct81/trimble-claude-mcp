# Trimble Claude MCP — GitHub + Render + Firebase

Starter production-oriented architecture for a Trimble Connect MCP server and Firebase-hosted extension UI.

## Architecture
- GitHub: source control
- Render: Node.js MCP + OAuth backend
- Firebase Hosting: Trimble Connect extension frontend
- Trimble Identity: per-user OAuth
- Trimble Connect API: user-authorized data
- Anthropic API: optional Claude orchestration

## Important production notes
1. The included session store is intentionally in-memory for development. Replace it with Firestore, Redis, or PostgreSQL before multi-instance production.
2. Set `FIREBASE_STORAGE_BUCKET` in Render to enable shared temporary PDF uploads across restarts and instances. Uploads expire after 15 minutes.
3. Set `PUBLIC_BASE_URL` to the deployed HTTPS origin so MCP export results contain working download URLs.
4. Verify the exact Trimble OAuth endpoints/scopes for your registered Trimble application before deployment.
5. Do not commit `.env` or secrets.
6. The MCP HTTP implementation is a minimal starter transport. For Claude remote MCP compatibility, align it with the current MCP Streamable HTTP/auth requirements and SDK version you deploy.
7. The Firebase UI is a starter shell. Replace `YOUR-RENDER-NAME` and wire the chat orchestration to your desired Claude/MCP flow.

## Local run
```bash
cp .env.example .env
npm install
npm start
```
Open `http://localhost:3000/health`.

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
Set all variables from `.env.example` in Render. After deployment set `TRIMBLE_REDIRECT_URI` to:
`https://YOUR-RENDER-NAME.onrender.com/oauth/callback`

## Firebase
```bash
firebase login
firebase init hosting
firebase deploy
```
Use `public` as the hosting directory. Replace the Render URL in `public/index.html`.

## Suggested next production work
- Firestore token/session persistence with encryption at rest
- OAuth PKCE/state and robust callback validation
- Exact MCP Streamable HTTP implementation using the current official SDK
- MCP authorization metadata/discovery as required by the Claude client
- Trimble API pagination/error handling
- Project/model/object/issue/file tools
- Claude tool orchestration endpoint
- Trimble Connect extension SDK context and selected-object integration
- Rate limiting, CSRF protection, audit logging, and structured logging
"# trimble-claude-mcp" 
