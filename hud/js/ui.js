// =====================================================================
// ASTRALOSINT — Interface Layer
// Handles: console open/close, tabs, HUD clock/cursor, toasts,
// search UI, tag selection, geolocation, clipboard, import/export, shortcuts
// =====================================================================

// ---------------------------------------------------------------- toast system
function toast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.classList.add("fade-out");
        setTimeout(() => el.remove(), 250);
    }, 3200);
}

// ---------------------------------------------------------------- console open/close
const consoleEl = document.getElementById("console");
const consoleFab = document.getElementById("console-fab");
const consoleClose = document.getElementById("console-close");

function openConsole() { consoleEl.classList.add("active"); }
function closeConsole() { consoleEl.classList.remove("active"); }
function toggleConsole() { consoleEl.classList.toggle("active"); }

consoleFab.addEventListener("click", toggleConsole);
consoleClose.addEventListener("click", closeConsole);

// close console on map click (mobile-friendly), but not when clicking inside it
map.on("click", () => {
    if (window.innerWidth < 900) closeConsole();
});

// open by default on wider screens
if (window.innerWidth >= 900) openConsole();

// ---------------------------------------------------------------- tabs
document.querySelectorAll(".tab").forEach(tabBtn => {
    tabBtn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
        tabBtn.classList.add("active");
        document.querySelector(`.panel[data-panel="${tabBtn.dataset.tab}"]`).classList.add("active");
    });
});

function switchToTab(name) {
    document.querySelector(`.tab[data-tab="${name}"]`)?.click();
}

// ---------------------------------------------------------------- HUD clock
function tickClock() {
    const now = new Date();
    document.getElementById("hud-time").textContent = now.toISOString().slice(11, 19);
}
tickClock();
setInterval(tickClock, 1000);

function updateZoomReadout(z) {
    document.getElementById("hud-zoom").textContent = z;
}
updateZoomReadout(map.getZoom());

function updateCursorReadout(lat, lng) {
    document.getElementById("hud-cursor").textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

// connection status
function setLinkStatus(online) {
    const dot = document.getElementById("hud-status");
    const text = document.getElementById("hud-status-text");
    dot.classList.toggle("offline", !online);
    dot.classList.toggle("online", online);
    text.textContent = online ? "LINK OK" : "OFFLINE";
}
window.addEventListener("online", () => { setLinkStatus(true); toast("Connection restored.", "success"); });
window.addEventListener("offline", () => { setLinkStatus(false); toast("Network connection lost.", "error"); });
setLinkStatus(navigator.onLine);

// ---------------------------------------------------------------- coordinate readout (bottom-left)
function onCoordDesignated(lat, lng, address) {
    const readout = document.getElementById("coord-readout");
    readout.classList.add("armed");
    readout.querySelector(".coord-line").textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    readout.querySelector(".coord-sub").textContent = address || "Resolving address…";
}

document.getElementById("coord-copy").addEventListener("click", () => {
    const lat = document.getElementById("lat").value;
    const lng = document.getElementById("lng").value;
    if (!lat || !lng) { toast("No target designated yet.", "warn"); return; }
    navigator.clipboard.writeText(`${lat}, ${lng}`)
        .then(() => toast("Coordinates copied to clipboard.", "success"))
        .catch(() => toast("Clipboard copy failed.", "error"));
});

// ---------------------------------------------------------------- search
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");

async function runSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchResults.innerHTML = '<div class="empty-state">Searching…</div>';
    try {
        const results = await performSearch(q);
        if (!results.length) {
            searchResults.innerHTML = '<div class="empty-state">No matches found.</div>';
            return;
        }
        searchResults.innerHTML = "";
        results.forEach(r => {
            const div = document.createElement("div");
            div.className = "search-result-item";
            div.innerHTML = `<span class="r-name">${escapeHtml(r.display_name)}</span><span class="r-type">${escapeHtml(r.type || "location")}</span>`;
            div.addEventListener("click", () => {
                jumpTo(parseFloat(r.lat), parseFloat(r.lon), r.display_name, 14);
                switchToTab("intel");
                toast("Target relocated.", "success");
            });
            searchResults.appendChild(div);
        });
    } catch {
        searchResults.innerHTML = '<div class="empty-state">Search failed — network error.</div>';
        toast("Search request failed.", "error");
    }
}

document.getElementById("search-btn").addEventListener("click", runSearch);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

// ---------------------------------------------------------------- locate me
document.getElementById("locate-btn").addEventListener("click", () => {
    if (!navigator.geolocation) { toast("Geolocation unsupported on this device.", "error"); return; }
    toast("Requesting device location…", "info");
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            jumpTo(pos.coords.latitude, pos.coords.longitude, "Current device position", 16);
            switchToTab("intel");
            toast("Position acquired.", "success");
        },
        () => toast("Location permission denied or unavailable.", "error"),
        { enableHighAccuracy: true, timeout: 8000 }
    );
});

// ---------------------------------------------------------------- layers UI
document.querySelectorAll(".layer-card").forEach(card => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".layer-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        setLayer(card.dataset.layer);
        toast(`Imagery layer: ${card.dataset.layer}`, "info");
    });
});

document.getElementById("cluster-toggle").addEventListener("change", (e) => {
    setClustering(e.target.checked);
});

// ---------------------------------------------------------------- overlay plugin toggles
// Renders one toggle row per plugin registered via AstralLayers.register()
// (see js/layers/registry.js) — new overlays never need an HTML edit.
if (window.AstralLayers) {
    const overlayContainer = document.getElementById("overlay-toggles");
    AstralLayers.all().forEach(plugin => {
        const row = document.createElement("label");
        row.className = "toggle-row";
        row.innerHTML = `
            <span>${plugin.icon ? plugin.icon + " " : ""}${escapeHtml(plugin.label)}</span>
            <input type="checkbox" id="overlay-${plugin.id}">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
        `;
        row.querySelector("input").addEventListener("change", (e) => {
            AstralLayers.toggle(plugin.id, e.target.checked, map);
            toast(`${plugin.label}: ${e.target.checked ? "on" : "off"}`, "info");
        });
        overlayContainer.appendChild(row);
    });
}

// ---------------------------------------------------------------- tag chips
let selectedTag = "Custom";
document.querySelectorAll(".tag-chip").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".tag-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        selectedTag = chip.dataset.tag;
    });
});

// ---------------------------------------------------------------- save / clear / delete targets
document.getElementById("save-point-btn").addEventListener("click", () => {
    const name = document.getElementById("point-name").value.trim();
    const note = document.getElementById("point-note").value.trim();
    const result = savePoint(name, selectedTag, note);

    if (!result.ok) {
        toast(result.reason === "no-target" ? "Click the map to designate a point first." : "Enter a target name.", "warn");
        return;
    }
    document.getElementById("point-name").value = "";
    document.getElementById("point-note").value = "";
    toast(`Target "${name}" logged.`, "success");
});

document.getElementById("clear-points-btn").addEventListener("click", () => {
    if (!savedPoints.length) { toast("Intel log is already empty.", "info"); return; }
    if (!confirm(`Remove all ${savedPoints.length} logged targets? This cannot be undone.`)) return;
    clearAllPoints();
    toast("Intel log cleared.", "warn");
});

// ---------------------------------------------------------------- export / import
document.getElementById("export-btn").addEventListener("click", async () => {
    if (!savedPoints.length) { toast("Nothing to export yet.", "warn"); return; }
    const result = await exportPoints();
    if (result.canceled) return;
    if (!result.ok) { toast("Export failed.", "error"); return; }
    toast(result.path ? `Intel exported to ${result.path}` : "Intel exported as JSON.", "success");
});

const importFileInput = document.getElementById("import-file");
document.getElementById("import-btn").addEventListener("click", async () => {
    if (window.astralBridge && window.astralBridge.isElectron) {
        const result = await window.astralBridge.openJsonFile();
        if (result.canceled) return;
        if (!result.ok) { toast("Import failed to read file.", "error"); return; }
        const outcome = importPoints(result.content);
        if (!outcome.ok) {
            toast("Import failed — invalid JSON file.", "error");
        } else {
            toast(`Imported ${outcome.added} target(s).`, "success");
        }
        return;
    }
    // Browser fallback (e.g. run.sh + localhost, no Electron bridge present)
    importFileInput.click();
});
importFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const result = importPoints(reader.result);
        if (!result.ok) {
            toast("Import failed — invalid JSON file.", "error");
        } else {
            toast(`Imported ${result.added} target(s).`, "success");
        }
    };
    reader.readAsText(file);
    importFileInput.value = "";
});

// ---------------------------------------------------------------- routing UI
document.getElementById("plot-route-btn").addEventListener("click", createRoute);
document.getElementById("clear-route-btn").addEventListener("click", () => {
    clearRoute();
    toast("Route cleared.", "info");
});

// ---------------------------------------------------------------- keyboard shortcuts
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openConsole();
        switchToTab("search");
        searchInput.focus();
    }
    if (e.key === "Escape") {
        closeConsole();
        searchInput.blur();
    }
});
