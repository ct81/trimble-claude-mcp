const TILE_SIZE = 256;
const MAX_ZOOM = 19;
const EQUATOR_LENGTH = 2 * Math.PI * 6378137;
const FRUSTUM_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7],
    [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

const osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const mapLayers = {
    Street: {
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: osm
    },
    Satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Imagery &copy; <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri and imagery providers</a>'
    },
    Transit: {
        url: 'https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png',
        maxNativeZoom: 18,
        attribution: `Map &copy; <a href="https://www.memomaps.de/">MemoMaps</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA</a>) | ${osm}`
    },
    Terrain: {
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        maxNativeZoom: 17,
        attribution: `${osm}, SRTM | <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>)`
    }
};

export function getMapLayer(name, ground = false) {
    // MemoMaps does not permit cross-origin use as a WebGL texture.
    if (ground && name === 'Transit') {
        return {
            url: 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
            attribution: `${osm} | &copy; <a href="https://carto.com/attributions">CARTO</a>`
        };
    }
    return mapLayers[name];
}
function wrapLongitude(lng) {
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

export function getMapLinks({ lat, lng }, zoom) {
    const center = `${lat.toFixed(6)},${wrapLongitude(lng).toFixed(6)}`;
    const mapsUrl = 'https://www.google.com/maps/@?';
    return {
        traffic: mapsUrl + new URLSearchParams({
            api: '1', map_action: 'map', center, zoom: String(zoom), layer: 'traffic'
        }),
        streetView: mapsUrl + new URLSearchParams({ api: '1', map_action: 'pano', viewpoint: center })
    };
}

export function createMapPlacement(crs, { lat, lng, x, z }) {
    const origin = crs.latLngToPoint({ lat, lng }, 0);
    const metersPerPixel = EQUATOR_LENGTH * Math.cos(lat * Math.PI / 180) / TILE_SIZE;
    function toLatLng({ x: worldX, z: worldZ }) {
        return crs.pointToLatLng({
            x: origin.x + (worldX - x) / metersPerPixel,
            y: origin.y + (worldZ - z) / metersPerPixel
        }, 0);
    }
    function toWorld(px, py, zoom) {
        const scale = 2 ** zoom;
        return { x: x + (px / scale - origin.x) * metersPerPixel, z: z + (py / scale - origin.y) * metersPerPixel };
    }
    return {
        toWorld,
        fromLatLng(point, focus = { x, z }) {
            const focusLongitude = toLatLng(focus).lng;
            const pixel = crs.latLngToPoint({
                lat: point.lat, lng: focusLongitude + wrapLongitude(point.lng - focusLongitude)
            }, 0);
            return toWorld(pixel.x, pixel.y, 0);
        },
        toLatLng,
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

function createOverlayGroundMap(THREE, scene, groundY, showToast) {
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
    let map, placement, layer, lastView, retainTiles = false;

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
        layer = null;
        lastView = null;
    }

    function show(anchor, layerName) {
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
        setLayer(layerName);
        previousWorld.elements.fill(0);
        return true;
    }

    function setLayer(name) {
        if (layer) map.removeLayer(layer);
        for (const tile of tiles.keys()) removeTile(tile);
        retiredTiles.clear();
        const { url, maxNativeZoom } = getMapLayer(name, true);
        let reportedTileError = false;
        layer = globalThis.L.tileLayer(url, { crossOrigin: true, maxZoom: MAX_ZOOM, maxNativeZoom, keepBuffer: 1 })
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
                    showToast(`Some ${name} ground map tiles could not load. Try another layer or check your connection.`, 'error');
                    reportedTileError = true;
                }
            })
            .addTo(map);
    }

    function update(camera) {
        if (!map) return;
        camera.updateMatrixWorld();
        if (previousWorld.equals(camera.matrixWorld) && previousProjection.equals(camera.projectionMatrix)) return;
        previousWorld.copy(camera.matrixWorld);
        previousProjection.copy(camera.projectionMatrix);
        if (camera.position.y <= groundY) return true;
        for (let i = 0; i < corners.length; i++) {
            corners[i].set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1).unproject(camera);
        }
        const bounds = getGroundBounds(corners, groundY);
        if (!bounds) return true;
        const { key, center, zoom } = placement.getView(bounds, map.getSize().x);
        if (key !== lastView) {
            // Leaflet unloads the old zoom synchronously; keep its textures until the new tiles settle.
            retainTiles = Boolean(lastView) && map.getZoom() !== zoom && retiredTiles.size === 0;
            map.setView(center, zoom, { animate: false });
            retainTiles = false;
            lastView = key;
        }
        return true;
    }

    return {
        show, hide, setLayer, update,
        getLinks: (focus) => getMapLinks(placement.toLatLng(focus), lastView ? map.getZoom() : 13),
        fromLatLng: (point, focus) => placement.fromLatLng(point, focus)
    };
}

function createInteractiveGroundMap(groundY, showToast, { camera, controls, container }) {
    const source = document.getElementById('interactive-ground-map');
    let map, layer, placement, saved, syncing = false, previousView = '', linksDirty = false;
    let metersPerPixel;
    const copy = point => ({ x: point.x, y: point.y, z: point.z });
    const key = () => [camera.position.x, camera.position.y, camera.position.z,
        controls.target.x, controls.target.z, source.clientWidth, source.clientHeight, camera.fov].join(':');

    function syncCamera() {
        if (!map || syncing) return;
        const focus = placement.fromLatLng(map.getCenter(), controls.target);
        const height = map.getSize().y * metersPerPixel / 2 ** map.getZoom() /
            (2 * Math.tan(camera.fov * Math.PI / 360));
        controls.target.set(focus.x, groundY, focus.z);
        camera.position.set(focus.x, groundY + height, focus.z);
        camera.up.set(0, 0, -1);
        camera.lookAt(controls.target);
        previousView = key();
        linksDirty = true;
    }

    function setLayer(name) {
        if (layer) map.removeLayer(layer);
        const { url, maxNativeZoom, attribution } = getMapLayer(name);
        let reported = false;
        layer = globalThis.L.tileLayer(url, { maxZoom: MAX_ZOOM, maxNativeZoom, attribution })
            .on('tileerror', () => {
                if (!reported) {
                    showToast(`Some ${name} ground map tiles could not load. Try another layer or check your connection.`, 'error');
                    reported = true;
                }
            }).addTo(map);
    }

    function update() {
        if (!map) return;
        if (previousView === key()) {
            const changed = linksDirty;
            linksDirty = false;
            return changed;
        }
        syncing = true;
        try {
            map.invalidateSize({ pan: false });
            const height = Math.max(1, camera.position.y - groundY);
            const span = 2 * height * Math.tan(camera.fov * Math.PI / 360);
            const zoom = Math.max(2, Math.min(MAX_ZOOM, Math.log2(map.getSize().y * metersPerPixel / span)));
            map.setView(placement.toLatLng(controls.target), zoom, { animate: false });
        } finally {
            syncing = false;
        }
        syncCamera();
        linksDirty = false;
        return true;
    }

    function hide() {
        if (!map) return;
        map.remove();
        map = layer = null;
        source.hidden = true;
        container.classList.remove('interactive-ground-active');
        camera.up.set(saved.up.x, saved.up.y, saved.up.z);
        camera.position.set(saved.position.x, saved.position.y, saved.position.z);
        controls.target.set(saved.target.x, saved.target.y, saved.target.z);
        controls.enabled = saved.enabled;
        controls.update();
    }

    function show(anchor, layerName) {
        const L = globalThis.L;
        if (!L) {
            showToast('Leaflet could not load. Check your connection and reload the page.', 'error');
            return false;
        }
        hide();
        placement = createMapPlacement(L.CRS.EPSG3857, anchor);
        metersPerPixel = EQUATOR_LENGTH * Math.cos(anchor.lat * Math.PI / 180) / TILE_SIZE;
        saved = { position: copy(camera.position), target: copy(controls.target), up: copy(camera.up), enabled: controls.enabled };
        controls.enabled = false;
        source.hidden = false;
        container.classList.add('interactive-ground-active');
        map = L.map(source, {
            attributionControl: false, zoomControl: false, zoomAnimation: false, fadeAnimation: false,
            minZoom: 2, maxZoom: MAX_ZOOM, zoomSnap: 0, zoomDelta: .5
        });
        map.on('move zoom resize', syncCamera);
        setLayer(layerName);
        const height = Math.max(10, Math.abs(camera.position.y - groundY));
        controls.target.set(anchor.x, groundY, anchor.z);
        camera.position.set(anchor.x, groundY + height, anchor.z);
        previousView = '';
        update();
        return true;
    }
    return {
        show, hide, setLayer, update,
        getLinks: focus => getMapLinks(placement.toLatLng(focus), map.getZoom()),
        fromLatLng: (point, focus) => placement.fromLatLng(point, focus)
    };
}

export function createGroundMap(THREE, scene, groundY, showToast, view) {
    const overlay = createOverlayGroundMap(THREE, scene, groundY, showToast);
    const interactive = createInteractiveGroundMap(groundY, showToast, view);
    let active = null, mode = 'overlay', anchor, layerName;
    return {
        get mode() { return mode; },
        get visible() { return active !== null; },
        show(nextAnchor, nextLayer) {
            const target = mode === 'interactive' ? interactive : overlay;
            if (active) active.hide();
            active = null;
            if (!target.show(nextAnchor, nextLayer)) return false;
            active = target;
            anchor = { ...nextAnchor };
            layerName = nextLayer;
            return true;
        },
        hide() {
            if (active) active.hide();
            active = null;
        },
        setMode(nextMode) {
            if (!['overlay', 'interactive'].includes(nextMode)) throw new Error('Invalid ground map mode.');
            if (mode === nextMode) return true;
            if (!active) { mode = nextMode; return true; }
            const previousMode = mode, previous = active;
            previous.hide();
            const next = nextMode === 'interactive' ? interactive : overlay;
            if (!next.show(anchor, layerName)) {
                active = previous.show(anchor, layerName) ? previous : null;
                mode = previousMode;
                return false;
            }
            active = next;
            mode = nextMode;
            return true;
        },
        setLayer(name) { active.setLayer(name); layerName = name; },
        update(camera) { return active?.update(camera); },
        getLinks(focus) { return active.getLinks(focus); },
        fromLatLng(point, focus) { return active.fromLatLng(point, focus); }
    };
}
