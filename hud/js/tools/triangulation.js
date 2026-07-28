// =====================================================================
// ASTRALOSINT — Bearing Triangulation
//
// Classic cross-bearing / resection technique: given 2+ observation
// points, each with a compass bearing toward the same target, find
// the best-fit intersection. Uses a local flat-earth projection
// (fine for the tens-to-hundreds-of-km range this is meant for) and
// linear least squares so it works cleanly with 2 lines (exact
// intersection) or 3+ (best-fit, with a residual as a confidence
// indicator).
// =====================================================================

(function () {
    const $ = (id) => document.getElementById(id);
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    let pointCount = 0;
    const MAX_POINTS = 5;

    function addPointRow(prefillLat = "", prefillLng = "") {
        if (pointCount >= MAX_POINTS) { toast(`Maximum ${MAX_POINTS} observation points.`, "warn"); return; }
        const idx = pointCount++;
        const row = document.createElement("div");
        row.className = "tri-point-row";
        row.dataset.index = idx;
        row.innerHTML = `
            <div class="panel-label spaced">Point ${idx + 1}${idx >= 2 ? ' <button type="button" class="link-btn tri-remove">remove</button>' : ""}</div>
            <div class="coord-grid">
                <div><label>Latitude</label><input class="tri-lat" placeholder="e.g. 40.1250" value="${prefillLat}"></div>
                <div><label>Longitude</label><input class="tri-lng" placeholder="e.g. -105.2370" value="${prefillLng}"></div>
            </div>
            <div class="coord-grid">
                <div><label>Bearing to target (°)</label><input class="tri-bearing" type="number" min="0" max="360" step="0.1" placeholder="e.g. 128.5"></div>
                <div><label>&nbsp;</label><button type="button" class="btn ghost full tri-use-target">Use Target</button></div>
            </div>
        `;
        $("tri-points").appendChild(row);

        row.querySelector(".tri-use-target").addEventListener("click", () => {
            const lat = $("lat").value, lng = $("lng").value;
            if (!lat || !lng) { toast("No target designated yet — click the map or search first.", "warn"); return; }
            row.querySelector(".tri-lat").value = lat;
            row.querySelector(".tri-lng").value = lng;
        });

        const removeBtn = row.querySelector(".tri-remove");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                row.remove();
                pointCount--;
                renumberRows();
            });
        }
    }

    function renumberRows() {
        document.querySelectorAll(".tri-point-row").forEach((row, i) => {
            const label = row.querySelector(".panel-label");
            const removeBtn = row.querySelector(".tri-remove");
            label.childNodes[0].textContent = `Point ${i + 1} `;
            row.dataset.index = i;
            if (removeBtn) {
                // re-bind closure-safe remove
                const newBtn = removeBtn.cloneNode(true);
                removeBtn.replaceWith(newBtn);
                newBtn.addEventListener("click", () => { row.remove(); pointCount--; renumberRows(); });
            }
        });
    }

    $("tri-add-point").addEventListener("click", () => addPointRow());

    // seed with 2 rows by default
    addPointRow();
    addPointRow();

    function readPoints() {
        const rows = document.querySelectorAll(".tri-point-row");
        const pts = [];
        for (const row of rows) {
            const lat = parseFloat(row.querySelector(".tri-lat").value);
            const lng = parseFloat(row.querySelector(".tri-lng").value);
            const bearing = parseFloat(row.querySelector(".tri-bearing").value);
            if (isNaN(lat) || isNaN(lng) || isNaN(bearing)) return null;
            pts.push({ lat, lng, bearing });
        }
        return pts;
    }

    $("tri-calc").addEventListener("click", () => {
        const pts = readPoints();
        if (!pts || pts.length < 2) {
            toast("Fill in latitude, longitude, and bearing for at least 2 points.", "warn");
            return;
        }

        // Local flat-earth projection centered on the centroid of the points.
        const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const lon0 = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
        const mPerDegLat = 111320;
        const mPerDegLon = 111320 * Math.cos(toRad(lat0));

        const toXY = (lat, lng) => ({
            x: (lng - lon0) * mPerDegLon,
            y: (lat - lat0) * mPerDegLat,
        });
        const fromXY = (x, y) => ({
            lat: lat0 + y / mPerDegLat,
            lng: lon0 + x / mPerDegLon,
        });

        // Each bearing line: point p, direction d = (sin(b), cos(b)).
        // Perpendicular normal n = (cos(b), -sin(b)). Constraint: n·P = n·p.
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        const lines = pts.map((p) => {
            const xy = toXY(p.lat, p.lng);
            const br = toRad(p.bearing);
            const nx = Math.cos(br), ny = -Math.sin(br);
            a11 += nx * nx; a12 += nx * ny; a22 += ny * ny;
            const rhs = nx * xy.x + ny * xy.y;
            b1 += nx * rhs; b2 += ny * rhs;
            return { xy, nx, ny };
        });

        const det = a11 * a22 - a12 * a12;
        if (Math.abs(det) < 1e-9) {
            toast("Bearings are parallel or nearly so — can't find an intersection.", "error");
            return;
        }
        const Px = (b1 * a22 - a12 * b2) / det;
        const Py = (a11 * b2 - a12 * b1) / det;

        const residuals = lines.map((l) => Math.abs(l.nx * (Px - l.xy.x) + l.ny * (Py - l.xy.y)));
        const avgResidual = residuals.reduce((s, r) => s + r, 0) / residuals.length;

        const result = fromXY(Px, Py);
        const results = $("tri-results");
        results.innerHTML = `
            <div class="shadow-result-card">
                <div class="shadow-result-row"><span>Estimated location</span><b>${result.lat.toFixed(6)}, ${result.lng.toFixed(6)}</b></div>
                <div class="shadow-result-row dim"><span>${pts.length > 2 ? "Avg. residual (fit quality)" : "Note"}</span><b>${pts.length > 2 ? avgResidual.toFixed(0) + " m" : "Exact 2-line intersection"}</b></div>
            </div>
            <button id="tri-jump-btn" class="btn primary full" type="button">Jump to Map</button>
        `;
        $("tri-jump-btn").addEventListener("click", () => {
            jumpTo(result.lat, result.lng, "Triangulated Position");
            toast("Jumped to triangulated position — flip to Intel to save it as a target.", "success");
        });
    });
})();
