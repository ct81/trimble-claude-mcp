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

export function createGroundMap(THREE, scene, groundY, showToast, { camera, controls, container }) {
    const source = document.getElementById('map-tile-source');
    let map, placement, layer, savedView, metersPerPixel, syncing = false, previousView = '';
    const vector = value => ({ x: value.x, y: value.y, z: value.z });

    function hide() {
        if (!map) return;
        map.remove();
        map = null;
        layer = null;
        source.hidden = true;
        container.classList.remove('leaflet-ground-active');
        camera.position.set(savedView.position.x, savedView.position.y, savedView.position.z);
        camera.up.set(savedView.up.x, savedView.up.y, savedView.up.z);
        controls.target.set(savedView.target.x, savedView.target.y, savedView.target.z);
        controls.enabled = savedView.enabled;
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
        savedView = { position: vector(camera.position), target: vector(controls.target), up: vector(camera.up), enabled: controls.enabled };
        controls.enabled = false;
        source.hidden = false;
        container.classList.add('leaflet-ground-active');
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

    function syncCamera() {
        if (syncing || !map) return;
        const focus = placement.fromLatLng(map.getCenter(), controls.target);
        const height = map.getSize().y * metersPerPixel / 2 ** map.getZoom() /
            (2 * Math.tan(camera.fov * Math.PI / 360));
        controls.target.set(focus.x, groundY, focus.z);
        camera.position.set(focus.x, groundY + height, focus.z);
        // North-up nadir view aligns the WebGL ground plane with Leaflet pixels.
        camera.up.set(0, 0, -1);
        camera.lookAt(controls.target);
        previousView = viewKey();
    }

    function viewKey() {
        return [camera.position.x, camera.position.y, camera.position.z,
            controls.target.x, controls.target.z, source.clientWidth, source.clientHeight, camera.fov].join(':');
    }

    function setLayer(name) {
        if (layer) map.removeLayer(layer);
        const { url, maxNativeZoom, attribution } = getMapLayer(name);
        let reportedTileError = false;
        layer = globalThis.L.tileLayer(url, { maxZoom: MAX_ZOOM, maxNativeZoom, attribution, keepBuffer: 1 })
            .on('tileerror', () => {
                if (!reportedTileError) {
                    showToast(`Some ${name} ground map tiles could not load. Try another layer or check your connection.`, 'error');
                    reportedTileError = true;
                }
            })
            .addTo(map);
    }

    function update() {
        if (!map) return;
        if (viewKey() === previousView) return;
        syncing = true;
        map.invalidateSize({ pan: false });
        const height = Math.max(1, camera.position.y - groundY);
        const span = 2 * height * Math.tan(camera.fov * Math.PI / 360);
        const zoom = Math.max(2, Math.min(MAX_ZOOM, Math.log2(map.getSize().y * metersPerPixel / span)));
        map.setView(placement.toLatLng(controls.target), zoom, { animate: false });
        syncing = false;
        syncCamera();
        return true;
    }

    return {
        show, hide, setLayer, update,
        getLinks: (focus) => getMapLinks(placement.toLatLng(focus), map.getZoom()),
        fromLatLng: (point, focus) => placement.fromLatLng(point, focus)
    };
}
