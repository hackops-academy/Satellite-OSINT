// =====================================================================
// ASTRALOSINT — Shared Geo Math
//
// Spherical-earth helpers (haversine distance, initial bearing,
// destination point, intermediate point along a great circle) used by
// the triangulation and line-of-sight tools. Standard great-circle
// navigation formulas, WGS84 mean radius.
// =====================================================================

window.GeoMath = (() => {
    const R = 6371000; // mean Earth radius, meters
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    function haversineDistance(lat1, lon1, lat2, lon2) {
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    function initialBearing(lat1, lon1, lat2, lon2) {
        const phi1 = toRad(lat1), phi2 = toRad(lat2);
        const dLon = toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(phi2);
        const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    // Point at `fraction` (0..1) along the great circle from (lat1,lon1) to (lat2,lon2)
    function intermediatePoint(lat1, lon1, lat2, lon2, fraction) {
        const phi1 = toRad(lat1), lambda1 = toRad(lon1);
        const phi2 = toRad(lat2), lambda2 = toRad(lon2);

        const dSigma =
            2 *
            Math.asin(
                Math.sqrt(
                    Math.sin((phi2 - phi1) / 2) ** 2 +
                    Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2
                )
            );
        if (dSigma === 0) return { lat: lat1, lon: lon1 };

        const a = Math.sin((1 - fraction) * dSigma) / Math.sin(dSigma);
        const b = Math.sin(fraction * dSigma) / Math.sin(dSigma);
        const x = a * Math.cos(phi1) * Math.cos(lambda1) + b * Math.cos(phi2) * Math.cos(lambda2);
        const y = a * Math.cos(phi1) * Math.sin(lambda1) + b * Math.cos(phi2) * Math.sin(lambda2);
        const z = a * Math.sin(phi1) + b * Math.sin(phi2);

        const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
        const lambda = Math.atan2(y, x);
        return { lat: toDeg(phi), lon: toDeg(lambda) };
    }

    return { R, haversineDistance, initialBearing, intermediatePoint, toRad, toDeg };
})();
