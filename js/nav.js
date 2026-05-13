(function () {
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("primary-nav");
  var backdrop = document.getElementById("nav-backdrop");
  if (!toggle || !nav) return;

  function isNarrow() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  function setOpen(open) {
    nav.classList.toggle("nav--open", open);
    toggle.classList.toggle("nav-toggle--open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.body.classList.toggle("nav-open", open);
    document.documentElement.classList.toggle("nav-open", open);
    if (backdrop) {
      backdrop.classList.toggle("nav-backdrop--visible", open);
      backdrop.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }

  toggle.addEventListener("click", function () {
    if (!isNarrow()) return;
    setOpen(!nav.classList.contains("nav--open"));
  });

  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }

  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      if (isNarrow()) setOpen(false);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (!isNarrow()) setOpen(false);
  });

  window.addEventListener("orientationchange", function () {
    setOpen(false);
  });
})();
