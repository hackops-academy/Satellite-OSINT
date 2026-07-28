// =====================================================================
// ASTRALOSINT — Analyst Tools tab mode switch
// Generic 3-way toggle between Coordinates / Triangulate / Line of Sight,
// mirrors the pattern used in the Shadow tool but scoped to its own
// classes so the two toggles never cross-wire.
// =====================================================================

(function () {
    document.querySelectorAll(".tools-mode-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tools-mode-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tools-mode-panel").forEach((p) => p.classList.remove("active"));
            document.querySelector(`.tools-mode-panel[data-mode="${btn.dataset.mode}"]`).classList.add("active");
        });
    });
})();
