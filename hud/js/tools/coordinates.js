// =====================================================================
// ASTRALOSINT — Coordinate System Conversions
//
// Decimal degrees <-> DMS <-> UTM <-> MGRS, WGS84 ellipsoid.
// UTM projection uses the standard Snyder transverse-mercator series
// (USGS Professional Paper 1395 formulas — public domain, ~1m
// accuracy, the same math behind most GIS/GPS coordinate tools).
// MGRS layers the standard 100km grid-square lettering scheme on top.
//
// This is NOT survey-grade (no datum shift handling beyond WGS84,
// no polar UPS for the caps above 84N/below 80S) — it's built for
// OSINT-analyst-grade coordinate translation, not land surveying.
// =====================================================================

window.CoordConvert = (() => {
    const A = 6378137.0; // WGS84 semi-major axis
    const F = 1 / 298.257223563; // WGS84 flattening
    const K0 = 0.9996;
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    const e = Math.sqrt(F * (2 - F));
    const e2 = e * e, e4 = e2 * e2, e6 = e4 * e2;
    const ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

    // ---------------------------------------------------------- DMS <-> Decimal
    function decimalToDMS(deg, isLat) {
        const hemi = isLat ? (deg >= 0 ? "N" : "S") : (deg >= 0 ? "E" : "W");
        const abs = Math.abs(deg);
        const d = Math.floor(abs);
        const minFloat = (abs - d) * 60;
        const m = Math.floor(minFloat);
        const s = (minFloat - m) * 60;
        return { deg: d, min: m, sec: s, hemi };
    }

    function dmsToDecimal(d, m, s, hemi) {
        let dec = Math.abs(d) + m / 60 + s / 3600;
        if (hemi === "S" || hemi === "W") dec = -dec;
        return dec;
    }

    function formatDMS(deg, isLat) {
        const { deg: d, min: m, sec: s, hemi } = decimalToDMS(deg, isLat);
        return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0")}"${hemi}`;
    }

    // ---------------------------------------------------------- lat/lon -> UTM
    function utmZoneFor(lat, lon) {
        let zone = Math.floor((lon + 180) / 6) + 1;
        // Norway/Svalbard exceptions
        if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
        if (lat >= 72 && lat < 84) {
            if (lon >= 0 && lon < 9) zone = 31;
            else if (lon >= 9 && lon < 21) zone = 33;
            else if (lon >= 21 && lon < 33) zone = 35;
            else if (lon >= 33 && lon < 42) zone = 37;
        }
        return zone;
    }

    function latLonToUTM(lat, lon) {
        const zone = utmZoneFor(lat, lon);
        const lonOrigin = (zone - 1) * 6 - 180 + 3;
        const latRad = toRad(lat), lonRad = toRad(lon), lonOriginRad = toRad(lonOrigin);

        const N = A / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
        const T = Math.tan(latRad) ** 2;
        const C = ep2 * Math.cos(latRad) ** 2;
        const Aa = Math.cos(latRad) * (lonRad - lonOriginRad);

        const M = A * (
            (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * latRad -
            (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * latRad) +
            (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * latRad) -
            (35 * e6 / 3072) * Math.sin(6 * latRad)
        );

        let easting = K0 * N * (
            Aa + (1 - T + C) * Aa ** 3 / 6 +
            (5 - 18 * T + T * T + 72 * C - 58 * ep2) * Aa ** 5 / 120
        ) + 500000;

        let northing = K0 * (
            M + N * Math.tan(latRad) * (
                Aa ** 2 / 2 +
                (5 - T + 9 * C + 4 * C * C) * Aa ** 4 / 24 +
                (61 - 58 * T + T * T + 600 * C - 330 * ep2) * Aa ** 6 / 720
            )
        );
        if (lat < 0) northing += 10000000;

        return { zone, hemisphere: lat >= 0 ? "N" : "S", easting, northing };
    }

    // ---------------------------------------------------------- UTM -> lat/lon
    function utmToLatLon(zone, hemisphere, easting, northing) {
        const x = easting - 500000;
        let y = northing;
        if (hemisphere === "S") y -= 10000000;

        const M = y / K0;
        const mu = M / (A * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));

        const phi1 =
            mu +
            (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) +
            (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) +
            (151 * e1 ** 3 / 96) * Math.sin(6 * mu) +
            (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

        const N1 = A / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
        const T1 = Math.tan(phi1) ** 2;
        const C1 = ep2 * Math.cos(phi1) ** 2;
        const R1 = A * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) ** 2, 1.5);
        const D = x / (N1 * K0);

        const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
            D ** 2 / 2 -
            (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 +
            (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720
        );

        const lonOrigin = (zone - 1) * 6 - 180 + 3;
        const lon = toRad(lonOrigin) + (
            D -
            (1 + 2 * T1 + C1) * D ** 3 / 6 +
            (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120
        ) / Math.cos(phi1);

        return { lat: toDeg(lat), lon: toDeg(lon) };
    }

    // ---------------------------------------------------------- MGRS lettering
    const LAT_BAND_TABLE = [
        [-80, "C"], [-72, "D"], [-64, "E"], [-56, "F"], [-48, "G"], [-40, "H"], [-32, "J"], [-24, "K"],
        [-16, "L"], [-8, "M"], [0, "N"], [8, "P"], [16, "Q"], [24, "R"], [32, "S"], [40, "T"],
        [48, "U"], [56, "V"], [64, "W"], [72, "X"],
    ];
    function latBand(lat) {
        if (lat < -80 || lat > 84) return null;
        let band = "X";
        for (let i = LAT_BAND_TABLE.length - 1; i >= 0; i--) {
            if (lat >= LAT_BAND_TABLE[i][0]) { band = LAT_BAND_TABLE[i][1]; break; }
        }
        return band;
    }

    const E100K_SETS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
    const N100K_EVEN = "ABCDEFGHJKLMNPQRSTUV"; // 20 letters, no I/O
    const N100K_ODD = "FGHJKLMNPQRSTUVABCDE";

    function hundredKSquareID(easting, northing, zone) {
        let setParm = zone % 6;
        if (setParm === 0) setParm = 6;
        const colLetters = E100K_SETS[(setParm - 1) % 3];
        const colIdx = Math.floor(easting / 100000) - 1;
        const colLetter = colLetters[Math.max(0, Math.min(7, colIdx))];

        const rowLetters = setParm % 2 === 0 ? N100K_ODD : N100K_EVEN;
        const rowIdx = Math.floor(northing / 100000) % 20;
        const rowLetter = rowLetters[rowIdx];

        return colLetter + rowLetter;
    }

    function latLonToMGRS(lat, lon, precision = 5) {
        const band = latBand(lat);
        if (!band) return null; // outside standard UTM/MGRS coverage (polar caps)
        const utm = latLonToUTM(lat, lon);
        const sq = hundredKSquareID(utm.easting, utm.northing, utm.zone);
        const eDigits = String(Math.floor(utm.easting % 100000)).padStart(5, "0").slice(0, precision);
        const nDigits = String(Math.floor(utm.northing % 100000)).padStart(5, "0").slice(0, precision);
        return `${utm.zone}${band} ${sq} ${eDigits} ${nDigits}`;
    }

    // MGRS -> lat/lon. Disambiguates the 100km-square repeat (every 2,000km
    // in northing) by searching for the candidate whose resulting latitude
    // falls inside the parsed band's [min, max) range.
    function mgrsToLatLon(mgrsStr) {
        const cleaned = mgrsStr.trim().toUpperCase().replace(/\s+/g, "");
        const m = cleaned.match(/^(\d{1,2})([C-HJ-NP-X])([A-Z]{2})(\d+)$/);
        if (!m) return null;
        const zone = parseInt(m[1], 10);
        const band = m[2];
        const sq = m[3];
        const digits = m[4];
        if (digits.length % 2 !== 0) return null;
        const precision = digits.length / 2;
        const scale = Math.pow(10, 5 - precision);
        const eastingPart = parseInt(digits.slice(0, precision), 10) * scale;
        const northingPart = parseInt(digits.slice(precision), 10) * scale;

        let setParm = zone % 6;
        if (setParm === 0) setParm = 6;
        const colLetters = E100K_SETS[(setParm - 1) % 3];
        const colIdx = colLetters.indexOf(sq[0]);
        if (colIdx === -1) return null;
        const easting = (colIdx + 1) * 100000 + eastingPart;

        const rowLetters = setParm % 2 === 0 ? N100K_ODD : N100K_EVEN;
        const rowIdx = rowLetters.indexOf(sq[1]);
        if (rowIdx === -1) return null;

        // band bounds -> hemisphere + rough northing bracket
        const bandEntry = LAT_BAND_TABLE.find((b) => b[1] === band);
        const bandMinLat = bandEntry[0];
        const hemisphere = bandMinLat < 0 ? "S" : "N";

        let best = null;
        for (let k = -1; k <= 5; k++) {
            const candidateNorthing = rowIdx * 100000 + northingPart + k * 2000000;
            if (candidateNorthing < 0 || candidateNorthing > 10000000) continue;
            const ll = utmToLatLon(zone, hemisphere, easting, candidateNorthing);
            const b = latBand(ll.lat);
            if (b === band) { best = ll; break; }
            if (!best) best = ll; // fallback: closest attempt if exact band match not found
        }
        return best;
    }

    return {
        decimalToDMS, dmsToDecimal, formatDMS,
        latLonToUTM, utmToLatLon,
        latLonToMGRS, mgrsToLatLon,
        utmZoneFor,
    };
})();
