// =====================================================================
// ASTRALOSINT — Line of Sight / Viewshed
//
// Given an observer and a target (each with a height above ground),
// samples terrain elevation along the great-circle path between them
// (via the free Open-Elevation API) and checks whether the straight
// sight line clears the terrain — applying the standard "earth bulge"
// correction (curvature + a standard 4/3 refraction coefficient) used
// in radio path-profile and line-of-sight tools.
//
// Needs network access to the Open-Elevation API; degrades to a clear
// error toast if that's unreachable rather than silently guessing.
// =====================================================================

(function () {
    const $ = (id) => document.getElementById(id);
    const SAMPLES = 40;
    const REFRACTION_K = 4 / 3;

    function earthBulge(d1, d2) {
        return (d1 * d2) / (2 * REFRACTION_K * GeoMath.R);
    }

    async function fetchElevations(points) {
        const body = { locations: points.map((p) => ({ latitude: p.lat, longitude: p.lon })) };
        const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`Elevation API returned ${res.status}`);
        const data = await res.json();
        return data.results.map((r) => r.elevation);
    }

    function readField(id) {
        const v = parseFloat($(id).value);
        return isNaN(v) ? null : v;
    }

    $("los-obs-use-target").addEventListener("click", () => {
        const lat = $("lat").value, lng = $("lng").value;
        if (!lat || !lng) { toast("No target designated yet — click the map or search first.", "warn"); return; }
        $("los-obs-lat").value = lat; $("los-obs-lng").value = lng;
    });
    $("los-tgt-use-target").addEventListener("click", () => {
        const lat = $("lat").value, lng = $("lng").value;
        if (!lat || !lng) { toast("No target designated yet — click the map or search first.", "warn"); return; }
        $("los-tgt-lat").value = lat; $("los-tgt-lng").value = lng;
    });

    function renderProfileSVG(samples, obsElev, tgtElev, distanceKm) {
        const w = 280, h = 110, pad = 8;
        const elevs = samples.map((s) => s.terrain);
        const lineVals = samples.map((s) => s.effectiveLOS);
        const allVals = [...elevs, ...lineVals, obsElev, tgtElev];
        const minV = Math.min(...allVals), maxV = Math.max(...allVals);
        const range = Math.max(1, maxV - minV);

        const xAt = (i) => pad + (i / (samples.length - 1)) * (w - 2 * pad);
        const yAt = (v) => h - pad - ((v - minV) / range) * (h - 2 * pad);

        const terrainPath = samples.map((s, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(s.terrain).toFixed(1)}`).join(" ");
        const losPath = samples.map((s, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(s.effectiveLOS).toFixed(1)}`).join(" ");
        const terrainFill = `${terrainPath} L${xAt(samples.length - 1).toFixed(1)},${h - pad} L${xAt(0).toFixed(1)},${h - pad} Z`;

        return `
            <svg viewBox="0 0 ${w} ${h}" class="los-profile-svg">
                <path d="${terrainFill}" fill="rgba(255,180,84,0.12)" stroke="none"></path>
                <path d="${terrainPath}" fill="none" stroke="var(--amber, #ffb454)" stroke-width="1.5"></path>
                <path d="${losPath}" fill="none" stroke="var(--cyan, #00e5ff)" stroke-width="1.3" stroke-dasharray="4 3"></path>
            </svg>
            <div class="los-profile-legend">
                <span><i style="background:var(--amber,#ffb454)"></i>Terrain</span>
                <span><i style="background:var(--cyan,#00e5ff)"></i>Sight line (curvature-corrected)</span>
                <span class="dim">0 – ${distanceKm.toFixed(1)} km</span>
            </div>
        `;
    }

    $("los-check-btn").addEventListener("click", async () => {
        const obsLat = readField("los-obs-lat"), obsLon = readField("los-obs-lng");
        const tgtLat = readField("los-tgt-lat"), tgtLon = readField("los-tgt-lng");
        const obsHeight = readField("los-obs-height") ?? 1.7;
        const tgtHeight = readField("los-tgt-height") ?? 0;

        if (obsLat === null || obsLon === null || tgtLat === null || tgtLon === null) {
            toast("Enter valid coordinates for both observer and target.", "warn");
            return;
        }

        const distance = GeoMath.haversineDistance(obsLat, obsLon, tgtLat, tgtLon);
        if (distance < 10) { toast("Observer and target are essentially the same point.", "warn"); return; }

        const btn = $("los-check-btn");
        btn.disabled = true; btn.textContent = "Fetching elevation data…";

        try {
            const path = [];
            for (let i = 0; i < SAMPLES; i++) {
                const frac = i / (SAMPLES - 1);
                const pt = GeoMath.intermediatePoint(obsLat, obsLon, tgtLat, tgtLon, frac);
                path.push({ lat: pt.lat, lon: pt.lon, frac });
            }
            const elevations = await fetchElevations(path);

            const obsElev = elevations[0] + obsHeight;
            const tgtElev = elevations[SAMPLES - 1] + tgtHeight;

            const samples = path.map((p, i) => {
                const d1 = p.frac * distance, d2 = distance - d1;
                const lineHeight = obsElev + (tgtElev - obsElev) * p.frac;
                const bulge = earthBulge(d1, d2);
                return {
                    frac: p.frac,
                    terrain: elevations[i],
                    lineHeight,
                    effectiveLOS: lineHeight - bulge, // sagging reference line; compare directly to raw terrain
                };
            });

            let worst = null;
            for (const s of samples.slice(1, -1)) {
                const clearance = s.effectiveLOS - s.terrain;
                if (!worst || clearance < worst.clearance) worst = { clearance, ...s };
            }
            const obstructed = worst.clearance < 0;

            const results = $("los-results");
            results.innerHTML = `
                <div class="shadow-result-card${obstructed ? " warn" : ""}">
                    <div class="shadow-result-row"><span>Distance</span><b>${(distance / 1000).toFixed(2)} km</b></div>
                    <div class="shadow-result-row"><span>Line of sight</span><b>${obstructed ? "OBSTRUCTED" : "CLEAR"}</b></div>
                    <div class="shadow-result-row dim"><span>${obstructed ? "Worst point" : "Min. clearance"}</span><b>${obstructed ? `blocked by ~${Math.abs(worst.clearance).toFixed(0)}m at ${(worst.frac * distance / 1000).toFixed(1)}km` : `${worst.clearance.toFixed(0)}m at ${(worst.frac * distance / 1000).toFixed(1)}km`}</b></div>
                </div>
                <div class="los-profile-wrap">${renderProfileSVG(samples, obsElev, tgtElev, distance / 1000)}</div>
            `;
        } catch (err) {
            toast("Elevation lookup failed — check your connection (uses the free Open-Elevation API).", "error");
            $("los-results").innerHTML = `<div class="empty-state">Couldn't fetch elevation data. ${err.message || ""}</div>`;
        } finally {
            btn.disabled = false; btn.textContent = "Check Line of Sight";
        }
    });
})();
