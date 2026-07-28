// =====================================================================
// ASTRALOSINT — Core Map Engine
// Handles: map init, tile layers, target markers, intel storage, routing
// =====================================================================

const TAG_ICONS = {
    Custom:  "📍",
    WiFi:    "📶",
    CCTV:    "🎥",
    Entry:   "🚪",
    Vehicle: "🚗",
    Person:  "👤",
};

// ---------------------------------------------------------------- state
let map, markerCluster, plainMarkerLayer, tempMarker;
let routingControl = null;
let routeLine = null;
let layers = {};
let currentLayer;
let clusteringEnabled = true;
let savedPoints = [];

try {
    savedPoints = JSON.parse(localStorage.getItem("astra_savedPoints")) || [];
} catch (e) {
    savedPoints = [];
}

// ---------------------------------------------------------------- init map
const WORLD_BOUNDS = L.latLngBounds([-90, -180], [90, 180]);

map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    minZoom: 3,                 // stops zooming out past a single world
    maxBounds: WORLD_BOUNDS,    // can't pan into a repeated copy either
    maxBoundsViscosity: 1.0,
    worldCopyJump: false,
}).setView([20.5937, 78.9629], 5);

const TILE_OPTS = { noWrap: true, bounds: WORLD_BOUNDS };

layers.street    = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, ...TILE_OPTS });
layers.satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, ...TILE_OPTS });
layers.terrain   = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, ...TILE_OPTS });
layers.dark      = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { maxZoom: 19, ...TILE_OPTS });

currentLayer = layers.dark.addTo(map);

markerCluster    = L.markerClusterGroup({ showCoverageOnHover: false });
plainMarkerLayer = L.layerGroup();
markerCluster.addTo(map);

// ---------------------------------------------------------------- helpers
function activeMarkerLayer() {
    return clusteringEnabled ? markerCluster : plainMarkerLayer;
}

function targetDivIcon() {
    return L.divIcon({
        className: "",
        html: '<div class="target-marker"><div class="ring"></div><div class="core"></div></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
}

// ---------------------------------------------------------------- temp marker (click-to-designate)
function placeTempMarker(lat, lng, address = "") {
    if (tempMarker) map.removeLayer(tempMarker);

    tempMarker = L.marker([lat, lng], { icon: targetDivIcon() }).addTo(map);

    document.getElementById("lat").value = lat.toFixed(6);
    document.getElementById("lng").value = lng.toFixed(6);
    if (address) document.getElementById("address").value = address;

    if (typeof onCoordDesignated === "function") {
        onCoordDesignated(lat, lng, address);
    }
}

// ---------------------------------------------------------------- map click -> reverse geocode
map.on("click", async (e) => {
    const { lat, lng } = e.latlng;
    placeTempMarker(lat, lng, "Resolving address…");

    try {
        const data = await reverseGeocode(lat, lng);
        const addr = (data && data.display_name) || "No address found for these coordinates";
        document.getElementById("address").value = addr;
        if (typeof onCoordDesignated === "function") onCoordDesignated(lat, lng, addr);
    } catch {
        document.getElementById("address").value = "Reverse geocode failed (network error)";
        if (typeof toast === "function") toast("Reverse geocoding failed — check connection.", "error");
    }
});

map.on("zoomend", () => {
    if (typeof updateZoomReadout === "function") updateZoomReadout(map.getZoom());
});
map.on("mousemove", (e) => {
    if (typeof updateCursorReadout === "function") updateCursorReadout(e.latlng.lat, e.latlng.lng);
});

// ---------------------------------------------------------------- geocoding
// Both helpers prefer the Electron main-process proxy (real User-Agent
// header, satisfies Nominatim's usage policy) and fall back to a direct
// browser fetch when running via run.sh with no Electron bridge present.
async function reverseGeocode(lat, lon) {
    if (window.astralBridge && window.astralBridge.isElectron) {
        const result = await window.astralBridge.reverseGeocode(lat, lon);
        if (!result.ok) throw new Error(result.error || "reverse geocode failed");
        return result.data;
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    return res.json();
}

async function performSearch(query) {
    if (!query) return [];
    if (window.astralBridge && window.astralBridge.isElectron) {
        const result = await window.astralBridge.searchPlaces(query);
        if (!result.ok) throw new Error(result.error || "search failed");
        return result.data;
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`);
    return res.json();
}

function jumpTo(lat, lng, label, zoom = 15) {
    map.setView([lat, lng], zoom);
    placeTempMarker(lat, lng, label);
}

// ---------------------------------------------------------------- layers
function setLayer(type) {
    if (!layers[type] || layers[type] === currentLayer) return;
    map.removeLayer(currentLayer);
    currentLayer = layers[type].addTo(map);
}

function setClustering(enabled) {
    if (enabled === clusteringEnabled) return;
    map.removeLayer(activeMarkerLayer());
    clusteringEnabled = enabled;
    activeMarkerLayer().addTo(map);
    drawPoints();
}

// ---------------------------------------------------------------- persistence
function persistPoints() {
    localStorage.setItem("astra_savedPoints", JSON.stringify(savedPoints));
}

function savePoint(name, tag, note) {
    const lat = parseFloat(document.getElementById("lat").value);
    const lng = parseFloat(document.getElementById("lng").value);
    if (!name || isNaN(lat) || isNaN(lng)) return { ok: false, reason: "no-target" };

    savedPoints.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, tag: tag || "Custom", note: note || "",
        lat, lng,
        address: document.getElementById("address").value || "",
        createdAt: new Date().toISOString(),
    });
    persistPoints();
    drawPoints();
    return { ok: true };
}

function deletePoint(id) {
    savedPoints = savedPoints.filter(p => p.id !== id);
    persistPoints();
    drawPoints();
    clearRoute();
}

function clearAllPoints() {
    savedPoints = [];
    persistPoints();
    drawPoints();
    clearRoute();
}

async function exportPoints() {
    const content = JSON.stringify(savedPoints, null, 2);
    const defaultName = `astralosint-intel-${new Date().toISOString().slice(0,10)}.json`;

    if (window.astralBridge && window.astralBridge.isElectron) {
        const result = await window.astralBridge.saveJsonFile(defaultName, content);
        if (result.canceled) return { ok: false, canceled: true };
        if (!result.ok) return { ok: false, reason: result.error || "write-failed" };
        return { ok: true, path: result.path };
    }

    // Browser fallback (e.g. run.sh + localhost, no Electron bridge present)
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return { ok: true };
}

function importPoints(jsonText) {
    let incoming;
    try {
        incoming = JSON.parse(jsonText);
    } catch {
        return { ok: false, reason: "parse" };
    }
    if (!Array.isArray(incoming)) return { ok: false, reason: "shape" };

    let added = 0;
    incoming.forEach(p => {
        if (typeof p.lat === "number" && typeof p.lng === "number" && p.name) {
            savedPoints.push({
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: p.name,
                tag: p.tag && TAG_ICONS[p.tag] ? p.tag : "Custom",
                note: p.note || "",
                lat: p.lat, lng: p.lng,
                address: p.address || "",
                createdAt: p.createdAt || new Date().toISOString(),
            });
            added++;
        }
    });
    persistPoints();
    drawPoints();
    return { ok: true, added };
}

// ---------------------------------------------------------------- render list + markers + dropdowns
function drawPoints() {
    activeMarkerLayer().clearLayers();
    if (window.AstralLayers) AstralLayers.notifyPointsChanged(savedPoints);

    const list = document.getElementById("point-list");
    const startSel = document.getElementById("route-start");
    const endSel = document.getElementById("route-end");
    const countBadge = document.getElementById("intel-count");

    list.innerHTML = "";
    startSel.innerHTML = '<option value="">— select —</option>';
    endSel.innerHTML = '<option value="">— select —</option>';

    if (countBadge) countBadge.textContent = savedPoints.length;

    if (!savedPoints.length) {
        list.innerHTML = '<div class="empty-state">No targets logged yet.</div>';
        return;
    }

    savedPoints.forEach((p) => {
        const icon = TAG_ICONS[p.tag] || TAG_ICONS.Custom;

        const marker = L.marker([p.lat, p.lng], {
            icon: L.divIcon({
                className: "",
                html: `<div style="font-size:20px; line-height:1; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.8));">${icon}</div>`,
                iconSize: [22, 22],
                iconAnchor: [11, 20],
            }),
        }).bindPopup(`<b>${escapeHtml(p.name)}</b><br>${icon} ${escapeHtml(p.tag)}${p.note ? "<br>" + escapeHtml(p.note) : ""}`);
        activeMarkerLayer().addLayer(marker);

        const div = document.createElement("div");
        div.className = "point-item";
        div.innerHTML = `
            <span class="point-icon">${icon}</span>
            <span class="point-meta">
                <span class="point-name">${escapeHtml(p.name)}</span>
                <span class="point-sub">${escapeHtml(p.tag)}${p.note ? " · " + escapeHtml(p.note) : ""}</span>
            </span>
            <button class="point-del" title="Delete target" data-id="${p.id}">✕</button>
        `;
        div.addEventListener("click", (ev) => {
            if (ev.target.classList.contains("point-del")) return;
            jumpTo(p.lat, p.lng, p.name, 16);
        });
        div.querySelector(".point-del").addEventListener("click", (ev) => {
            ev.stopPropagation();
            deletePoint(p.id);
            if (typeof toast === "function") toast(`Removed "${p.name}" from intel log.`, "warn");
        });
        list.appendChild(div);

        startSel.add(new Option(`${icon} ${p.name}`, p.id));
        endSel.add(new Option(`${icon} ${p.name}`, p.id));
    });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

// ---------------------------------------------------------------- routing
function createRoute() {
    clearRoute();

    const startId = document.getElementById("route-start").value;
    const endId = document.getElementById("route-end").value;
    const info = document.getElementById("route-info");

    if (!startId || !endId) {
        if (typeof toast === "function") toast("Select both a start and end target.", "warn");
        return;
    }
    if (startId === endId) {
        if (typeof toast === "function") toast("Start and end must be different targets.", "warn");
        return;
    }

    const a = savedPoints.find(p => p.id === startId);
    const b = savedPoints.find(p => p.id === endId);
    if (!a || !b) return;

    info.textContent = "Calculating route…";
    info.className = "route-info";

    if (!L.Routing) {
        if (typeof toast === "function") toast("Routing library unavailable — showing direct path.", "error");
        drawFallbackLine(a, b);
        return;
    }

    try {
        routingControl = L.Routing.control({
            waypoints: [L.latLng(a.lat, a.lng), L.latLng(b.lat, b.lng)],
            router: L.Routing.osrmv1({ serviceUrl: "https://router.project-osrm.org/route/v1" }),
            lineOptions: { styles: [{ color: "#00e5ff", opacity: 0.85, weight: 4 }] },
            createMarker: () => null,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: true,
            show: false,
        }).addTo(map);

        routingControl.on("routesfound", (e) => {
            const summary = e.routes[0].summary;
            const distKm = (summary.totalDistance / 1000).toFixed(1);
            const timeMin = Math.round(summary.totalTime / 60);
            info.textContent = `Road route: ${distKm} km · ~${timeMin} min`;
        });

        routingControl.on("routingerror", () => drawFallbackLine(a, b));
    } catch (e) {
        console.error("Routing exception:", e);
        drawFallbackLine(a, b);
    }
}

function drawFallbackLine(a, b) {
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }

    routeLine = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
        color: "#ff2d55", weight: 3, dashArray: "8, 8", opacity: 0.85,
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });

    const info = document.getElementById("route-info");
    info.textContent = "⚠ Road data unavailable — showing direct line-of-sight path.";
    info.className = "route-info warn";
}

function clearRoute() {
    if (routingControl) { map.removeControl(routingControl); routingControl = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    const info = document.getElementById("route-info");
    if (info) { info.textContent = ""; info.className = "route-info"; }
}

// ---------------------------------------------------------------- initial paint
drawPoints();
