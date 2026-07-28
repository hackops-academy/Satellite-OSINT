// =====================================================================
// ASTRALOSINT — Coordinate Converter UI
// Wires the Decimal / MGRS / UTM input forms to CoordConvert and
// renders all four representations for whichever one was submitted.
// =====================================================================

(function () {
    const $ = (id) => document.getElementById(id);

    function renderResult(lat, lon) {
        const dms = `${CoordConvert.formatDMS(lat, true)} ${CoordConvert.formatDMS(lon, false)}`;
        const utm = CoordConvert.latLonToUTM(lat, lon);
        const mgrs = CoordConvert.latLonToMGRS(lat, lon);

        $("cc-results").innerHTML = `
            <div class="shadow-result-card">
                <div class="shadow-result-row"><span>Decimal</span><b>${lat.toFixed(6)}, ${lon.toFixed(6)}</b></div>
                <div class="shadow-result-row"><span>DMS</span><b>${dms}</b></div>
                <div class="shadow-result-row"><span>UTM</span><b>${utm.zone}${utm.hemisphere} ${Math.round(utm.easting)}E ${Math.round(utm.northing)}N</b></div>
                <div class="shadow-result-row"><span>MGRS</span><b>${mgrs || "n/a (outside coverage)"}</b></div>
            </div>
            <button id="cc-jump-btn" class="btn primary full" type="button">Jump to Map</button>
        `;
        $("cc-jump-btn").addEventListener("click", () => {
            jumpTo(lat, lon, "Coordinate Conversion");
            toast("Jumped to converted coordinates.", "success");
        });
    }

    $("cc-dec-use-target").addEventListener("click", () => {
        const lat = $("lat").value, lng = $("lng").value;
        if (!lat || !lng) { toast("No target designated yet — click the map or search first.", "warn"); return; }
        $("cc-dec-lat").value = lat; $("cc-dec-lng").value = lng;
    });

    $("cc-dec-convert").addEventListener("click", () => {
        const lat = parseFloat($("cc-dec-lat").value);
        const lon = parseFloat($("cc-dec-lng").value);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            toast("Enter a valid latitude (-90..90) and longitude (-180..180).", "warn");
            return;
        }
        renderResult(lat, lon);
    });

    $("cc-mgrs-convert").addEventListener("click", () => {
        const raw = $("cc-mgrs-input").value;
        if (!raw.trim()) { toast("Enter an MGRS string, e.g. 31U DQ 48252 11954", "warn"); return; }
        const ll = CoordConvert.mgrsToLatLon(raw);
        if (!ll) { toast("Couldn't parse that MGRS string — check the format.", "error"); return; }
        renderResult(ll.lat, ll.lon);
    });

    $("cc-utm-convert").addEventListener("click", () => {
        const zone = parseInt($("cc-utm-zone").value, 10);
        const hemi = $("cc-utm-hemi").value;
        const easting = parseFloat($("cc-utm-easting").value);
        const northing = parseFloat($("cc-utm-northing").value);
        if (isNaN(zone) || zone < 1 || zone > 60 || isNaN(easting) || isNaN(northing)) {
            toast("Enter a valid UTM zone, easting, and northing.", "warn");
            return;
        }
        const ll = CoordConvert.utmToLatLon(zone, hemi, easting, northing);
        renderResult(ll.lat, ll.lon);
    });
})();
