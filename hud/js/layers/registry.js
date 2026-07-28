// =====================================================================
// ASTRALOSINT — Overlay Layer Plugin Registry
//
// v4.0 introduces a plugin pattern for map overlays so new analysis
// layers (terminator, heatmap, geofencing, ADS-B, ...) can be dropped
// in as self-contained modules instead of hardcoded into map.js.
//
// A plugin is a plain object:
//   {
//     id:      "terminator",       // unique, used as toggle key + storage key
//     label:   "Day / Night",      // shown in the Overlays list
//     icon:    "🌗",               // small glyph shown next to the label
//     enable(map)               -> called once when the user turns it on
//     disable(map)              -> called when turned off; must undo enable()
//     onPointsChanged(points)   -> optional; called whenever savedPoints changes
//                                   (only fires while the plugin is enabled)
//   }
//
// Plugins register themselves at load time via AstralLayers.register(),
// then ui.js renders a toggle row for each one and wires it up.
// =====================================================================

window.AstralLayers = (() => {
    const plugins = {};
    const order = [];

    function register(plugin) {
        if (!plugin || !plugin.id) {
            console.error("AstralLayers.register: plugin needs an id", plugin);
            return;
        }
        if (plugins[plugin.id]) {
            console.warn(`AstralLayers.register: "${plugin.id}" already registered, overwriting`);
        } else {
            order.push(plugin.id);
        }
        plugins[plugin.id] = { enabled: false, ...plugin };
    }

    function get(id) {
        return plugins[id];
    }

    function all() {
        return order.map(id => plugins[id]);
    }

    function toggle(id, on, mapInstance) {
        const p = plugins[id];
        if (!p) {
            console.error(`AstralLayers.toggle: unknown plugin "${id}"`);
            return;
        }
        if (on && !p.enabled) {
            p.enable(mapInstance);
            p.enabled = true;
        } else if (!on && p.enabled) {
            p.disable(mapInstance);
            p.enabled = false;
        }
    }

    function notifyPointsChanged(points) {
        order.forEach(id => {
            const p = plugins[id];
            if (p.enabled && typeof p.onPointsChanged === "function") {
                p.onPointsChanged(points);
            }
        });
    }

    return { register, get, all, toggle, notifyPointsChanged };
})();
