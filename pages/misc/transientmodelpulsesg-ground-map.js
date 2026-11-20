const TILE_SIZE = 256;
const MAX_ZOOM = 19;
const EQUATOR_LENGTH = 2 * Math.PI * 6378137;
const FRUSTUM_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7],
    [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export function createMapPlacement(crs, { lat, lng, x, z }) {
    const origin = crs.latLngToPoint({ lat, lng }, 0);
    const metersPerPixel = EQUATOR_LENGTH * Math.cos(lat * Math.PI / 180) / TILE_SIZE;
    return {
        toWorld(px, py, zoom) {
            const scale = 2 ** zoom;
            return { x: x + (px / scale - origin.x) * metersPerPixel, z: z + (py / scale - origin.y) * metersPerPixel };
        },
        getView(bounds, viewportSize) {
            const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
            // Leave room to pan before Leaflet needs a new tile window.
            const zoom = Math.max(0, Math.min(MAX_ZOOM, Math.floor(Math.log2(viewportSize * metersPerPixel / (span * 1.35)))));
            const scale = 2 ** zoom;
            const snap = (value) => Math.round(value / (TILE_SIZE / 2)) * (TILE_SIZE / 2);
            const px = snap((origin.x + ((bounds.minX + bounds.maxX) / 2 - x) / metersPerPixel) * scale);
            const py = snap((origin.y + ((bounds.minZ + bounds.maxZ) / 2 - z) / metersPerPixel) * scale);
            return { key: `${zoom}:${px}:${py}`, zoom, center: crs.pointToLatLng({ x: px, y: py }, zoom) };
        }
    };
}

export function getGroundBounds(corners, groundY) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const [i, j] of FRUSTUM_EDGES) {
        const a = corners[i], b = corners[j];
        if (groundY < Math.min(a.y, b.y) || groundY > Math.max(a.y, b.y)) continue;
        for (const t of a.y === b.y ? [0, 1] : [(groundY - a.y) / (b.y - a.y)]) {
            const x = a.x + (b.x - a.x) * t;
            const z = a.z + (b.z - a.z) * t;
            minX = Math.min(minX, x);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxZ = Math.max(maxZ, z);
        }
    }
    return minX <= maxX ? { minX, minZ, maxX, maxZ } : null;
}

export function createGroundMap(THREE, scene, groundY, showToast) {
    const source = document.getElementById('map-tile-source');
    const group = new THREE.Group();
    scene.add(group);
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const tiles = new Map();
    const retiredTiles = new Set();
    const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
    const previousWorld = new THREE.Matrix4();
    const previousProjection = new THREE.Matrix4();
    let map, placement, lastView, retainTiles = false;

    function removeTile(tile) {
        const mesh = tiles.get(tile);
        if (!mesh) return;
        group.remove(mesh);
        mesh.material.map.dispose();
        mesh.material.dispose();
        tiles.delete(tile);
    }

    function hide() {
        if (!map) return;
        map.remove();
        for (const tile of tiles.keys()) removeTile(tile);
        retiredTiles.clear();
        map = null;
        lastView = null;
    }

    function show(anchor) {
        const L = globalThis.L;
        if (!L) {
            showToast('Leaflet could not load. Check your connection and reload the page.', 'error');
            return false;
        }
        hide();
        placement = createMapPlacement(L.CRS.EPSG3857, anchor);
        map = L.map(source, {
            attributionControl: false, zoomControl: false, zoomAnimation: false, fadeAnimation: false,
            dragging: false, keyboard: false, scrollWheelZoom: false, doubleClickZoom: false,
            boxZoom: false, touchZoom: false, trackResize: false
        });
        let reportedTileError = false;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { crossOrigin: true, maxZoom: MAX_ZOOM, keepBuffer: 1 })
            .on('tileload', ({ tile, coords }) => {
                const { x, y, z } = coords;
                const corner = placement.toWorld(x * TILE_SIZE, y * TILE_SIZE, z);
                const opposite = placement.toWorld((x + 1) * TILE_SIZE, (y + 1) * TILE_SIZE, z);
                const texture = new THREE.Texture(tile);
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.needsUpdate = true;
                const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, fog: false }));
                mesh.position.set((corner.x + opposite.x) / 2, groundY, (corner.z + opposite.z) / 2);
                mesh.scale.set(opposite.x - corner.x, 1, opposite.z - corner.z);
                // During tile replacement, prefer the sharper tile where zoom levels overlap.
                mesh.renderOrder = z;
                group.add(mesh);
                tiles.set(tile, mesh);
            })
            .on('tileunload', ({ tile }) => {
                if (retainTiles && tiles.has(tile)) retiredTiles.add(tile);
                else removeTile(tile);
            })
            .on('load', () => {
                for (const tile of retiredTiles) removeTile(tile);
                retiredTiles.clear();
            })
            .on('tileerror', () => {
                if (!reportedTileError) {
                    showToast('Some ground map tiles could not load from OpenStreetMap.', 'error');
                    reportedTileError = true;
                }
            })
            .addTo(map);
        previousWorld.elements.fill(0);
        return true;
    }

    function update(camera) {
        if (!map) return;
        camera.updateMatrixWorld();
        if (previousWorld.equals(camera.matrixWorld) && previousProjection.equals(camera.projectionMatrix)) return;
        previousWorld.copy(camera.matrixWorld);
        previousProjection.copy(camera.projectionMatrix);
        if (camera.position.y <= groundY) return;
        for (let i = 0; i < corners.length; i++) {
            corners[i].set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1).unproject(camera);
        }
        const bounds = getGroundBounds(corners, groundY);
        if (!bounds) return;
        const { key, center, zoom } = placement.getView(bounds, map.getSize().x);
        if (key !== lastView) {
            // Leaflet unloads the old zoom synchronously; keep its textures until the new tiles settle.
            retainTiles = Boolean(lastView) && map.getZoom() !== zoom && retiredTiles.size === 0;
            map.setView(center, zoom, { animate: false });
            retainTiles = false;
            lastView = key;
        }
    }

    return { show, hide, update };
}
