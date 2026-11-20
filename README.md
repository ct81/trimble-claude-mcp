![Alt Text](https://ct81.github.io/trimble-claude-mcp/images/svg/roachharbor-logo-dark.svg)

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
and discover tools. For OAuth-capable clients, an unauthenticated tool call
returns the MCP OAuth challenge so the client can open its sign-in flow. The
server advertises protected-resource and authorization-server metadata at
`/.well-known/oauth-protected-resource` and
`/.well-known/oauth-authorization-server`; it also supports the MCP
protected-resource discovery paths ending in `/mcp`. Trimble Agent Studio
clients receive a manual sign-in/session-header instruction because they do
not handle the HTTP authentication challenge as an interactive sign-in flow.

Set `PUBLIC_BASE_URL` in Render to the public HTTPS origin, without a trailing
slash, for example `https://YOUR-RENDER-SERVICE.onrender.com`. OAuth discovery,
callback URLs, resource identifiers, and generated download links rely on this
value. Set `TRIMBLE_REDIRECT_URI` to
`https://YOUR-RENDER-SERVICE.onrender.com/oauth/callback` and register that
same callback URL in the Trimble application.

`TRIMBLE_SCOPE` supplies any additional scopes requested from Trimble Identity
and defaults to `openid profile email`. The server always includes `openid`,
`profile`, and `email` so it can resolve the signed-in account email. Those are
upstream Trimble OAuth scopes, not MCP-specific scopes advertised by this
server. If Agent Studio has a separate scope field, follow its connector
requirements; this server does not publish an MCP scope list. Whether a
Trimble Agent Studio tenant permits a particular hosting domain is controlled
by Trimble policy, not by this server.

The MCP/OAuth endpoints support cross-origin connector requests. Other API and
extension routes retain the configured `EXTENSION_ORIGIN` CORS policy.

## WhatsApp sign-in

WhatsApp Trimble sessions are isolated by chat. If a chat has not signed in, or
its Trimble credentials have expired, the bot responds with a sign-in link for
that chat. After completing OAuth, the user should resend the request.
WhatsApp login links are encrypted, expire after 24 hours, and are not tied to
one server process, so Render restarts do not invalidate a link. Links are
reusable until they expire, so WhatsApp link previews cannot invalidate them;
each OAuth attempt still uses its own single-use state. Chat-to-session
mappings use the server's in-memory store, so users may need to sign in again
after a server restart.

## Send a Telegram message with PowerShell

Run `pwsh -File src/telegram/send-message.ps1` from the repository root. The
script uses `GREEN_API_URL` and `GREEN_API_TELEGRAM_INSTANCE_ID` from the
environment when set, prompts for missing values, then securely prompts for
the GREEN-API Telegram token, chat ID, and message. You can also pass the chat
ID and message as `-ChatId` and `-Message` arguments.

## Ground map in Transient Model Pulse SG

In [Transient Model Pulse SG](pages/misc/transientmodelpulsesg.html), open **Settings → Ground Map**.
Enter a latitude and longitude in decimal degrees, and the matching model X and Z in metres
(leave both at `0` to place the map at the grid origin). Select **Apply Ground Map** to show
the street map below the grid. East is +X and north is −Z; the map stays fixed to the grid
as you pan, zoom, or orbit. Use **Hide Map** to turn it off. This places the map visually
without changing the IFC file or its coordinates. Map tiles require an internet connection.

While the ground map is visible, the lower-left controls switch between **Street**,
**Satellite**, **Transit** (CARTO Voyager rail and station styling), and **Terrain**.
The lower-right controls zoom the model camera or move it to **My location** without changing
the map alignment. **Traffic** and **Street View** open Google Maps at the camera's focus
in a new tab; they do not add live traffic or panoramas to the 3D scene.

Select **Start vehicle** in the main toolbar, next to **Map**, to drive a 3D pickup around
a demo loop centered on the current view. No ground map is required. The vehicle moves on
the same ground plane as the map, and its route stays in place as you pan, zoom, or orbit.
Use **Stop vehicle** to remove it. Hiding or applying the map also stops the simulation.
The demo does not follow roads or check for collisions with the model.

For an interactive 2D map, select **Map** in the toolbar. Pick **Street**, **Satellite**,
**Transit**, or **Terrain** in the lower left. **Traffic** opens live traffic in Google Maps
at the current map center. In the lower right, use **My location**, **+ / −** to zoom, or
**Street View** to open imagery near the map center in a new tab where coverage is available.
Location requires browser permission and HTTPS (or localhost). No API key is needed; the
Leaflet map starts in Singapore and does not change model coordinates.

Select **Explorer** in the toolbar to browse the loaded IFC's spatial hierarchy and
element types. Search by name or type, expand the tree, and select an item to see its
attributes and property sets in the Element Properties tabs. The tree also includes
uncontained products and elements without visible geometry.

## Available integrations

The MCP tool catalog includes Trimble Connect operations for users, regions,
projects, folders, files, models and entities, groups, organizer todos/views,
property sets, BCF issues/topics and related resources, and Status Sharing.
It also includes PDF schedule extraction/export, tender extraction, Python
testing, workspace workflows, and bridge selection. Tekla and SketchUp tools
are available through their respective local bridge integrations; a deployed
Render service cannot directly reach software running on a user's workstation
without a reachable bridge or relay.

### Brain argument adjustments in Call MCP

When Call MCP automatically dispatches Brain-generated calls, coordinate fields
(`x`, `y`, `z`, `x1`, `y1`, `z1`, `x2`, `y2`, `z2`, etc.) add offsets in
millimetres: `x: -300` sends `Brain X - 300`. This also applies to coordinates
inside point arrays and nested objects. Other nonblank fields replace Brain
values, including profile, material, numeric settings and boolean values.
Blank strings, nulls and empty arrays/objects preserve Brain values. Zero is
a zero coordinate offset or an explicit replacement for a non-coordinate field.
Use only coordinates present in the Brain payload; invalid offsets fail before
that request is sent. Without Brain data, or with explicit `{{row.*}}`
templates, coordinates retain their existing absolute/template behavior.
Offsets affect new calls only, not already-created Tekla objects.

### DXF slabs in Workflow Builder

Select **slab** to model closed structural DXF `LWPOLYLINE` outlines.
Their source vertices define each slab. When no closed structural slab outlines
are available, open slab-layer `LWPOLYLINE` direction markers locate regions
bounded by cleaned beam centerlines, curved perimeter arcs and supporting walls.
Markers are not modeled as small plates; multiple markers inside one region
produce a single region. Unenclosed markers are reported in `skipped`.
Beam modeling does not need to be selected. Support-sized gaps can be bridged,
but larger openings are not closed arbitrarily. Annotation/text-layer label
boxes are never used as slab boundaries.
Closure uses the DXF closed flag (`Closed` in JSON), or matching first/last
vertices. Source elevation is retained unless a slab Z level is entered.

A single unambiguous thickness label such as `200 mm`
supplies `PL200` unless a slab profile is entered. Review mixed thicknesses and
provide an explicit profile where required.

The current slab tool accepts three corners, so each region is triangulated
into multiple slab objects, preserving the entire boundary rather than only
its first three vertices.
Brain reports the region count separately from the creation-call count.
Derived curved boundaries use the beam arc's 1 mm sampling tolerance.
Nested derived boundaries are skipped for review; slab openings/holes and
polyline bulges are not supported.
This changes future conversions only; remove any previously created incorrect
slabs separately after reviewing them. Live Tekla insertion must still be verified.

### DXF beams in Workflow Builder

Select **beam** on the Brain node to model only DXF `LINE` and `ARC` records:
lines create straight beams and arcs create single polybeams. Other entity types
are skipped with a reason. The separate **polybeam** type accepts only DXF `ARC`
records, also creating one object per arc. Arcs require `Center_X`,
`Center_Y`, `Radius`, `StartAngle` and `EndAngle` (counterclockwise degrees).
They are sampled into one `tekla_create_polybeam` point contour in the XY plane,
with at most 1 mm chord deviation; this is a faceted approximation, not an exact
Tekla arc. Arc radius is not used as the beam's section size.
Before modeling, matching LINE boundaries and concentric ARC boundaries
are merged into one centerline member when their separation matches the section
width (0.1 mm tolerance). Pairing requires compatible profiles, material, class
and elevation; ambiguous pairs are left unchanged.
Endpoint trims may differ by up to the section width
(measured along the line or arc); paired spans must exceed twice the width.
For differently trimmed LINE edges with positive source dimensions, the merged
centerline's measured length is used rather than either boundary's length.
Repeated boundaries
are removed, and merged/skipped handles are reported. Genuine crossings are
preserved. Cleanup affects future conversions only, not existing Tekla objects.
For LINE beams, when `Length_mm`, `Width_mm`, and `Depth_mm` are all positive,
the source length sets the modeled 3D member span along the DXF line direction,
and width/depth set its section profile. If any dimension is missing or
non-positive, the beam keeps its DXF endpoints and existing profile behavior.
For beam, polybeam and slab, an entered **Z level mm** overrides all source
Z/elevation values, including an explicit level of `0`. A blank textbox preserves
source Z/elevation (or uses zero when absent). Column/wall heights and
footing/pile thickness/length settings retain their existing meaning.
On Brain conversion, blank profile textboxes for selected beam, polybeam,
column, wall, slab, footing and pile types are filled when the DXF has one
unambiguous nonempty section for that type (`300x600` becomes `300*600`).
Size text on the corresponding structural layers ending in `_T2` takes
precedence over exported profile fields; otherwise geometry profile fields
are used. Circular size labels such as `650 Dia` become `D650`.
Profiles are kept separate by type; grid and other annotation layers are excluded.
Entered settings are preserved, empty data leaves textboxes blank, and mixed
sections are listed in the textbox placeholder rather than choosing one.
Save the workflow to retain the populated settings.
The detected section also supplies blank per-type defaults
for that conversion; individual source sections retain their existing priority.
Annotations, unsupported entity types and zero-length paths are skipped with
reasons. LINE beams use their start/end fields; ARC polybeams use their
center, radius and angles rather than exported vertices.

The DXF script also exports `filterBeamCalls(resultOrCalls)` to retain only valid
beam/polybeam calls from mapped JSON and report rejected or duplicate entries in
`removed`. It filters creation payloads, not existing Tekla model objects.
Skipped arcs cannot be recovered from a mapped report containing only handles;
regenerate from the original DXF records with their curve geometry.

### DXF grid data in Workflow Builder

On a Brain node, select **gridline** to extract entities from
`S-_ANOTGRID_E`, `S-_ANOTGRID_E2`, `S-_ANOTGRID_T`, and `S-_ANOTGRID_T2`.
The Brain associates labels with straight, axis-aligned lines and generates one
`tekla_create_grid` call when both axes have unambiguous labels. The preview
includes the proposed grid, source entities, skipped entities and warnings.
Unsupported arcs, disconnected fragments and ambiguous or unlabeled lines are
not created. Raw entities remain available as rows for explicit mappings.

The generated grid assumes DXF coordinates are millimetres in Tekla's global
coordinate system and that the Windows bridge interprets coordinate arrays as
successive spacings from the origin. Extensions use the outermost line ends;
the parent grid has common rectangular extents, so individual line lengths may
change. Review the preview and verify these assumptions with the Windows
bridge before creating a grid. Normal model-modification authorization applies.
The MCP result includes `gridVerification` with the returned GUID when
recognizable, the submitted definition, skipped entities and bridge response.
A missing GUID is reported as unverified, not as a failed or successful
creation; inspect Tekla before retrying to avoid duplicate grids. The returned
GUID is not an independent model read-back.

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

The Workflow Builder's name field provides a dropdown of saved workflows and
accepts new names. **Save workflow** creates or updates the named entry;
**Load workflow** restores the selected entry from
the server. These actions require Trimble sign-in, and saved workflows are
visible from any browser or device after signing in.

When `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
and `FIREBASE_DATABASE_URL` are set, workflows are stored in the Firebase
Realtime Database under `workflowbuilder/`, which survives Render restarts and
redeploys. Create the database first in the Firebase Console (Build → Realtime
Database → Create database) and copy its URL into `FIREBASE_DATABASE_URL`.
Without Firebase, it falls back to
`pages/datastorage/workflowbuilder.json` on the server's local disk, which is
wiped on Render's ephemeral filesystem.

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
