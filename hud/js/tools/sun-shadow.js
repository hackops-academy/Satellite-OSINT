// =====================================================================
// ASTRALOSINT — Shadow Calculator
//
// Two modes for photo geolocation work:
//   1) Check Time  — given a lat/lng + UTC date/time, show sun
//      elevation/azimuth (compare directly against a photo's shadows).
//   2) Find Matching Times — given a lat/lng + UTC calendar date + an
//      observed shadow (object height + shadow length, or a raw
//      elevation angle), scan the day for the time(s) the sun would
//      produce that elevation. Optionally filter by shadow direction
//      (azimuth) to narrow morning vs afternoon.
// =====================================================================

(function () {
    const $ = (id) => document.getElementById(id);

    // ---------------------------------------------------------- helpers
    function elevationFromShadow(heightM, shadowLenM) {
        if (!(heightM > 0) || !(shadowLenM > 0)) return null;
        return (Math.atan(heightM / shadowLenM) * 180) / Math.PI;
    }

    function shadowBearingToSunAzimuth(shadowBearingDeg) {
        return (shadowBearingDeg + 180) % 360;
    }

    function fmtDeg(v) {
        return `${v.toFixed(1)}°`;
    }

    function buildUtcDate(dateStr, timeStr) {
        // dateStr: "YYYY-MM-DD", timeStr: "HH:MM" or "HH:MM:SS"
        if (!dateStr || !timeStr) return null;
        const iso = `${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}Z`;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    }

    // ---------------------------------------------------------- location
    function readLocation() {
        const lat = parseFloat($("shadow-lat").value);
        const lng = parseFloat($("shadow-lng").value);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng };
    }

    $("shadow-use-target").addEventListener("click", () => {
        const lat = $("lat").value;
        const lng = $("lng").value;
        if (!lat || !lng) {
            toast("No target designated yet — click the map or search first.", "warn");
            return;
        }
        $("shadow-lat").value = lat;
        $("shadow-lng").value = lng;
        toast("Location loaded from current target.", "success");
    });

    // ---------------------------------------------------------- mode toggle
    document.querySelectorAll(".shadow-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".shadow-mode-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".shadow-mode-panel").forEach((p) => p.classList.remove("active"));
            document.querySelector(`.shadow-mode-panel[data-mode="${btn.dataset.mode}"]`).classList.add("active");
            $("shadow-results").innerHTML = "";
        });
    });

    // ---------------------------------------------------------- live elevation-from-shadow preview
    function updateComputedElevation() {
        const h = parseFloat($("shadow-height").value);
        const s = parseFloat($("shadow-length").value);
        const el = elevationFromShadow(h, s);
        const out = $("shadow-computed-elevation");
        if (el === null) {
            out.textContent = "—";
        } else {
            out.textContent = fmtDeg(el);
            $("shadow-target-elevation").value = el.toFixed(2);
        }
    }
    $("shadow-height").addEventListener("input", updateComputedElevation);
    $("shadow-length").addEventListener("input", updateComputedElevation);

    // ---------------------------------------------------------- Mode 1: check a specific time
    $("shadow-check-btn").addEventListener("click", () => {
        const loc = readLocation();
        if (!loc) { toast("Enter a valid latitude and longitude.", "warn"); return; }

        const date = buildUtcDate($("shadow-date").value, $("shadow-time").value);
        if (!date) { toast("Enter a valid date and time (UTC).", "warn"); return; }

        const pos = SolarPosition.elevationAzimuth(date, loc.lat, loc.lng);
        const results = $("shadow-results");
        const belowHorizon = pos.elevation < 0;

        results.innerHTML = `
            <div class="shadow-result-card${belowHorizon ? " warn" : ""}">
                <div class="shadow-result-row"><span>Sun elevation</span><b>${fmtDeg(pos.elevation)}${belowHorizon ? " (below horizon)" : ""}</b></div>
                <div class="shadow-result-row"><span>Sun azimuth</span><b>${fmtDeg(pos.azimuth)} (${SolarPosition.compassLabel(pos.azimuth)})</b></div>
                <div class="shadow-result-row"><span>Shadow points toward</span><b>${fmtDeg((pos.azimuth + 180) % 360)} (${SolarPosition.compassLabel((pos.azimuth + 180) % 360)})</b></div>
                <div class="shadow-result-row dim"><span>Solar declination</span><b>${fmtDeg(pos.declination)}</b></div>
            </div>
        `;
    });

    // ---------------------------------------------------------- Mode 2: scan for matching times
    function scanDayForElevation(dateStr, lat, lng, targetElevation, toleranceDeg) {
        const baseDate = new Date(`${dateStr}T00:00:00Z`);
        const stepMin = 4;
        const samples = [];
        for (let m = 0; m <= 1440; m += stepMin) {
            const t = new Date(baseDate.getTime() + m * 60000);
            const pos = SolarPosition.elevationAzimuth(t, lat, lng);
            samples.push({ minutes: m, elevation: pos.elevation, azimuth: pos.azimuth });
        }

        const crossings = [];
        for (let i = 1; i < samples.length; i++) {
            const a = samples[i - 1], b = samples[i];
            const da = a.elevation - targetElevation;
            const db = b.elevation - targetElevation;
            if (da === 0 || (da < 0) !== (db < 0)) {
                // refine by bisection within [a.minutes, b.minutes]
                let lo = a.minutes, hi = b.minutes;
                for (let iter = 0; iter < 24; iter++) {
                    const mid = (lo + hi) / 2;
                    const t = new Date(baseDate.getTime() + mid * 60000);
                    const pos = SolarPosition.elevationAzimuth(t, lat, lng);
                    const dmid = pos.elevation - targetElevation;
                    if ((dmid < 0) === (da < 0)) lo = mid; else hi = mid;
                }
                const mid = (lo + hi) / 2;
                const t = new Date(baseDate.getTime() + mid * 60000);
                const pos = SolarPosition.elevationAzimuth(t, lat, lng);
                crossings.push({ time: t, elevation: pos.elevation, azimuth: pos.azimuth });
            }
        }
        return crossings;
    }

    $("shadow-find-btn").addEventListener("click", () => {
        const loc = readLocation();
        if (!loc) { toast("Enter a valid latitude and longitude.", "warn"); return; }

        const dateStr = $("shadow-find-date").value;
        if (!dateStr) { toast("Pick a UTC calendar date.", "warn"); return; }

        const targetElevation = parseFloat($("shadow-target-elevation").value);
        if (isNaN(targetElevation)) {
            toast("Enter an object height + shadow length, or a target elevation angle.", "warn");
            return;
        }

        const azimuthFilterRaw = $("shadow-azimuth-filter").value.trim();
        let sunAzTarget = null;
        if (azimuthFilterRaw !== "") {
            const bearing = parseFloat(azimuthFilterRaw);
            if (!isNaN(bearing)) sunAzTarget = shadowBearingToSunAzimuth(bearing);
        }
        const tolerance = 25; // degrees, azimuth match tolerance

        let matches = scanDayForElevation(dateStr, loc.lat, loc.lng, targetElevation, 0.5);
        if (sunAzTarget !== null) {
            matches = matches.filter((m) => {
                const diff = Math.abs(((m.azimuth - sunAzTarget + 180) % 360 + 360) % 360 - 180);
                return diff <= tolerance;
            });
        }

        const results = $("shadow-results");
        if (!matches.length) {
            results.innerHTML = `<div class="empty-state">No matching sun position found for that date${sunAzTarget !== null ? " and shadow direction" : ""} — try a different date or widen the search.</div>`;
            return;
        }

        results.innerHTML = matches.map((m) => {
            const hh = String(m.time.getUTCHours()).padStart(2, "0");
            const mm = String(m.time.getUTCMinutes()).padStart(2, "0");
            const shadowDir = (m.azimuth + 180) % 360;
            return `
                <div class="shadow-result-card">
                    <div class="shadow-result-row"><span>UTC time</span><b>${hh}:${mm}</b></div>
                    <div class="shadow-result-row"><span>Sun elevation</span><b>${fmtDeg(m.elevation)}</b></div>
                    <div class="shadow-result-row"><span>Sun azimuth</span><b>${fmtDeg(m.azimuth)} (${SolarPosition.compassLabel(m.azimuth)})</b></div>
                    <div class="shadow-result-row dim"><span>Shadow would point</span><b>${fmtDeg(shadowDir)} (${SolarPosition.compassLabel(shadowDir)})</b></div>
                </div>
            `;
        }).join("");
    });
})();
