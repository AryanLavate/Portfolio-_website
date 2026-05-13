(function () {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  gsap.registerPlugin(ScrollTrigger);

  var pin = document.getElementById("hero-pin");
  var section = document.getElementById("hero-cinematic");
  var letters = gsap.utils.toArray(".hero-cinematic__letter");
  if (!pin || !section || !letters.length) return;

  var dragEnabled = false;
  var activePointer = null;

  var scatter = [
    { x: "-14vw", y: "-18vh", r: -14 },
    { x: "-6vw", y: "12vh", r: 10 },
    { x: "2vw", y: "-8vh", r: -6 },
    { x: "10vw", y: "16vh", r: 12 },
    { x: "-4vw", y: "22vh", r: -8 },
    { x: "14vw", y: "-12vh", r: 6 },
    { x: "-10vw", y: "6vh", r: 14 },
    { x: "6vw", y: "-20vh", r: -10 },
    { x: "18vw", y: "4vh", r: 8 },
  ];

  gsap.set(letters, {
    transformOrigin: "50% 50%",
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 0.98,
  });

  var tl = gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "+=130%",
      pin: pin,
      scrub: 1.15,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: function (self) {
        if (self.progress >= 0.88 && !dragEnabled) enableDrag();
      },
    },
  });

  letters.forEach(function (el, i) {
    var s = scatter[i] || scatter[0];
    tl.to(
      el,
      {
        x: s.x,
        y: s.y,
        rotation: s.r,
        opacity: 1,
        scale: 1.06,
        ease: "none",
        duration: 1,
      },
      0
    );
  });

  function enableDrag() {
    dragEnabled = true;
    pin.classList.add("hero-cinematic__pin--drag-ready");
    letters.forEach(function (el) {
      el.setAttribute("aria-grabbed", "false");
    });
  }

  function onPointerDown(e) {
    if (!dragEnabled) return;
    var el = e.currentTarget;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    activePointer = {
      el: el,
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: gsap.getProperty(el, "x"),
      baseY: gsap.getProperty(el, "y"),
    };
    el.classList.add("hero-cinematic__letter--dragging");
    el.setAttribute("aria-grabbed", "true");
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
    document.body.classList.add("is-dragging-letter");
  }

  function onPointerMove(e) {
    if (!activePointer || e.pointerId !== activePointer.id) return;
    var dx = e.clientX - activePointer.startX;
    var dy = e.clientY - activePointer.startY;
    gsap.set(activePointer.el, {
      x: activePointer.baseX + dx,
      y: activePointer.baseY + dy,
    });
  }

  function onPointerUp(e) {
    if (!activePointer || e.pointerId !== activePointer.id) return;
    activePointer.el.classList.remove("hero-cinematic__letter--dragging");
    activePointer.el.setAttribute("aria-grabbed", "false");
    try {
      activePointer.el.releasePointerCapture(e.pointerId);
    } catch (_) {}
    activePointer = null;
    document.body.classList.remove("is-dragging-letter");
  }

  letters.forEach(function (el) {
    el.addEventListener("pointerdown", onPointerDown);
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Draggable letter");
  });

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  window.addEventListener(
    "keydown",
    function (e) {
      if (e.key !== "Escape" || !activePointer) return;
      onPointerUp({ pointerId: activePointer.id });
    },
    true
  );
})();
