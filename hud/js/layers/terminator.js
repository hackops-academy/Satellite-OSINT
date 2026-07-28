// =====================================================================
// ASTRALOSINT — Day / Night Terminator Overlay
//
// Shades the night hemisphere and tracks the sub-solar point (the spot
// on Earth directly under the sun right now) in real time. No external
// API — solar position is computed client-side from UTC time.
//
// Analyst use: this is the same geometry behind shadow-based photo
// geolocation — if you know roughly where a photo's shadows put the
// sun, this overlay + the terminator line narrows down when/where it
// could have been taken.
// =====================================================================

(function () {
    const DEG = Math.PI / 180;
    const RAD = 180 / Math.PI;
    const UPDATE_MS = 60 * 1000; // recompute once a minute

    let nightPolygon = null;
    let subsolarMarker = null;
    let intervalId = null;

    // ---- solar position (Cooper's approximation + standard hour angle)
    function dayOfYear(date) {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        return Math.floor((date.getTime() - start) / 86400000);
    }

    function solarDeclinationDeg(date) {
        const N = dayOfYear(date);
        return 23.44 * Math.sin(DEG * (360 / 365) * (284 + N));
    }

    function subsolarPoint(date) {
        const decl = solarDeclinationDeg(date);
        const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
        // Longitude currently facing the sun: solar noon is where local
        // time = 12:00, i.e. 15 degrees of longitude per hour from the
        // prime meridian, offset from UTC noon.
        let lng = -15 * (utcHours - 12);
        lng = ((lng + 180) % 360 + 360) % 360 - 180; // normalize to [-180, 180]
        return { lat: decl, lng };
    }

    // latitude of the terminator at a given longitude, for a given
    // sub-solar point (declination + sub-solar longitude)
    function terminatorLatAt(lngDeg, subsolar) {
        const decl = subsolar.lat * DEG;
        // Hour angle between this longitude and the sub-solar longitude
        const H = (lngDeg - subsolar.lng) * DEG;
        if (Math.abs(decl) < 1e-6) return 0; // equinox: terminator is a straight vertical line
        const lat = Math.atan(-Math.cos(H) / Math.tan(decl)) * RAD;
        return lat;
    }

    function buildNightPolygonLatLngs(date) {
        const subsolar = subsolarPoint(date);
        const decl = subsolar.lat;
        const northPoleIsDark = decl > 0 ? false : true; // sun over N hemisphere -> N pole lit

        const line = [];
        for (let lng = -180; lng <= 180; lng += 2) {
            line.push([terminatorLatAt(lng, subsolar), lng]);
        }

        // Close the polygon around whichever pole is dark so the fill
        // covers the correct (night) hemisphere.
        const poleLat = northPoleIsDark ? 90 : -90;
        const ring = [[poleLat, -180], ...line, [poleLat, 180]];
        return { ring, subsolar };
    }

    function paint(map) {
        const { ring, subsolar } = buildNightPolygonLatLngs(new Date());

        if (nightPolygon) map.removeLayer(nightPolygon);
        nightPolygon = L.polygon(ring, {
            color: "transparent",
            fillColor: "#000814",
            fillOpacity: 0.38,
            interactive: false,
        }).addTo(map);
        // send behind markers/routes but above tile layer
        nightPolygon.bringToBack();

        if (subsolarMarker) map.removeLayer(subsolarMarker);
        subsolarMarker = L.marker([subsolar.lat, subsolar.lng], {
            icon: L.divIcon({
                className: "",
                html: '<div class="subsolar-marker" title="Sub-solar point — sun directly overhead here right now">☀</div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11],
            }),
            interactive: false,
        }).addTo(map);
    }

    AstralLayers.register({
        id: "terminator",
        label: "Day / Night Terminator",
        icon: "🌗",
        enable(map) {
            paint(map);
            intervalId = setInterval(() => paint(map), UPDATE_MS);
        },
        disable(map) {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
            if (nightPolygon) { map.removeLayer(nightPolygon); nightPolygon = null; }
            if (subsolarMarker) { map.removeLayer(subsolarMarker); subsolarMarker = null; }
        },
    });
})();
