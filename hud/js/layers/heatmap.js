// =====================================================================
// ASTRALOSINT — Target Density Heatmap Overlay
//
// Renders the current intel log (savedPoints) as a heatmap, so dense
// clusters of targets pop out visually without needing to zoom/count.
// Requires Leaflet.heat (loaded in index.html). Degrades to a no-op
// with a toast warning if the library failed to load (e.g. offline).
// =====================================================================

(function () {
    let heatLayer = null;

    function pointsToHeatData(points) {
        // [lat, lng, intensity] — flat weight per point; density comes
        // from overlap, which is what we want for a "where do targets
        // cluster" view rather than weighting by tag type.
        return points.map(p => [p.lat, p.lng, 0.6]);
    }

    AstralLayers.register({
        id: "heatmap",
        label: "Target Density Heatmap",
        icon: "🔥",
        enable(map) {
            if (typeof L.heatLayer !== "function") {
                if (typeof toast === "function") {
                    toast("Heatmap library unavailable — check connection.", "error");
                }
                return;
            }
            heatLayer = L.heatLayer(pointsToHeatData(savedPoints), {
                radius: 28,
                blur: 22,
                maxZoom: 12,
                gradient: { 0.2: "#00e5ff", 0.5: "#ff9f1c", 0.8: "#ff2d55" },
            }).addTo(map);
        },
        disable(map) {
            if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
        },
        onPointsChanged(points) {
            if (heatLayer) heatLayer.setLatLngs(pointsToHeatData(points));
        },
    });
})();
