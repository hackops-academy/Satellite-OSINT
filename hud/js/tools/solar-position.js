// =====================================================================
// ASTRALOSINT — Solar Position Math
//
// Standard solar geometry (the widely-published NOAA General Solar
// Position algorithm): given a UTC date/time and a lat/lng, returns
// the sun's elevation and azimuth at that instant.
//
// This is a more precise sibling of the quick approximation used by
// the day/night terminator overlay — it includes the equation-of-time
// correction, which the terminator skips for simplicity. That extra
// precision matters here because the shadow calculator is solving for
// a specific time of day, not just a smooth day/night boundary.
//
// Pure math, no DOM — reusable by any future tool (this one, plus
// later bearing/triangulation or twilight-window features).
// =====================================================================

window.SolarPosition = (() => {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function julianDay(date) {
        return date.getTime() / 86400000 + 2440587.5;
    }

    function julianCentury(jd) {
        return (jd - 2451545.0) / 36525;
    }

    function geomMeanLongSun(t) {
        let L = 280.46646 + t * (36000.76983 + t * 0.0003032);
        L = L % 360;
        return L < 0 ? L + 360 : L;
    }

    function geomMeanAnomalySun(t) {
        return 357.52911 + t * (35999.05029 - 0.0001537 * t);
    }

    function eccentricityEarthOrbit(t) {
        return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    }

    function sunEqOfCenter(t) {
        const m = toRad(geomMeanAnomalySun(t));
        return (
            Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
            Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
            Math.sin(3 * m) * 0.000289
        );
    }

    function sunTrueLong(t) {
        return geomMeanLongSun(t) + sunEqOfCenter(t);
    }

    function sunApparentLong(t) {
        const omega = 125.04 - 1934.136 * t;
        return sunTrueLong(t) - 0.00569 - 0.00478 * Math.sin(toRad(omega));
    }

    function meanObliquityEcliptic(t) {
        return 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    }

    function obliquityCorrection(t) {
        const omega = 125.04 - 1934.136 * t;
        return meanObliquityEcliptic(t) + 0.00256 * Math.cos(toRad(omega));
    }

    // degrees
    function sunDeclination(t) {
        const eps = toRad(obliquityCorrection(t));
        const lambda = toRad(sunApparentLong(t));
        return toDeg(Math.asin(clamp(Math.sin(eps) * Math.sin(lambda), -1, 1)));
    }

    // minutes
    function equationOfTime(t) {
        const eps = toRad(obliquityCorrection(t));
        const l0 = toRad(geomMeanLongSun(t));
        const e = eccentricityEarthOrbit(t);
        const m = toRad(geomMeanAnomalySun(t));
        const y = Math.tan(eps / 2) ** 2;

        const val =
            y * Math.sin(2 * l0) -
            2 * e * Math.sin(m) +
            4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
            0.5 * y * y * Math.sin(4 * l0) -
            1.25 * e * e * Math.sin(2 * m);

        return toDeg(val) * 4;
    }

    /**
     * Elevation + azimuth of the sun for a UTC Date at a given lat/lng.
     * Azimuth is degrees clockwise from true north (standard compass
     * convention). Elevation is degrees above the horizon (negative =
     * below horizon / nighttime).
     */
    function elevationAzimuth(date, lat, lng) {
        const jd = julianDay(date);
        const t = julianCentury(jd);
        const decl = sunDeclination(t);
        const eqTime = equationOfTime(t);

        const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
        let trueSolarTime = (utcMinutes + eqTime + 4 * lng) % 1440;
        if (trueSolarTime < 0) trueSolarTime += 1440;

        let hourAngle = trueSolarTime / 4 - 180;
        if (hourAngle < -180) hourAngle += 360;

        const latRad = toRad(lat);
        const declRad = toRad(decl);
        const haRad = toRad(hourAngle);

        const cosZenith = clamp(
            Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad),
            -1, 1
        );
        const zenith = toDeg(Math.acos(cosZenith));
        const elevation = 90 - zenith;

        const zenithRad = toRad(zenith);
        let azimuth;
        const sinZenith = Math.sin(zenithRad);
        if (Math.abs(sinZenith) < 1e-6) {
            // sun at/near zenith directly overhead — azimuth undefined, default north
            azimuth = 0;
        } else {
            const cosAz = clamp(
                (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(declRad)) / (Math.cos(latRad) * sinZenith),
                -1, 1
            );
            const azRaw = toDeg(Math.acos(cosAz));
            azimuth = hourAngle > 0 ? (azRaw + 180) % 360 : (540 - azRaw) % 360;
        }

        return { elevation, azimuth, declination: decl, equationOfTimeMin: eqTime };
    }

    const COMPASS_16 = [
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    ];

    function compassLabel(azimuthDeg) {
        const idx = Math.round(((azimuthDeg % 360) + 360) % 360 / 22.5) % 16;
        return COMPASS_16[idx];
    }

    return { elevationAzimuth, compassLabel };
})();
