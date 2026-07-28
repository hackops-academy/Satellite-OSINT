// =====================================================================
// ASTRALOSINT FIELD MANUAL — nav scrollspy + mobile toggle
// =====================================================================
(function () {
    const toggle = document.getElementById("toc-toggle");
    const toc = document.getElementById("toc");
    if (toggle && toc) {
        toggle.addEventListener("click", () => toc.classList.toggle("open"));
        toc.querySelectorAll("a.toc-link").forEach((a) => {
            a.addEventListener("click", () => toc.classList.remove("open"));
        });
    }

    const links = Array.from(document.querySelectorAll(".toc-link"));
    const sections = links
        .map((link) => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);

    if (!sections.length) return;

    const setActive = (id) => {
        links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${id}`));
    };

    const observer = new IntersectionObserver(
        (entries) => {
            const visible = entries
                .filter((e) => e.isIntersecting)
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
            if (visible.length) setActive(visible[0].target.id);
        },
        { rootMargin: "-10% 0px -70% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
})();
