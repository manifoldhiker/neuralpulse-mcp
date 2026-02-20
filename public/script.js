(function initLandingPage() {
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  initCanvas(prefersReducedMotion);
  initFadeObserver(prefersReducedMotion);
  initChatAnimation(prefersReducedMotion);
  initNavScroll();
  initMobileMenu();
  initCopyUrl();
})();

function initCanvas(prefersReducedMotion) {
  if (prefersReducedMotion) return;

  var canvas = document.getElementById("pulse-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) return;

  var width = 0;
  var height = 0;
  var particles = [];
  var frameId = 0;

  var COLORS = ["124,92,252", "0,212,255", "200,80,242"];
  var MAX_PARTICLES = 100;
  var DIST_LIMIT = 140;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.35 + 0.08,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  function initializeParticles() {
    resize();
    var count = Math.min(Math.floor((width * height) / 14000), MAX_PARTICLES);
    particles = Array.from({ length: count }, createParticle);
  }

  function drawConnections() {
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < DIST_LIMIT) {
          var alpha = (1 - distance / DIST_LIMIT) * 0.1;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = "rgba(124,92,252," + alpha + ")";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach(function (p) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > width) p.vx *= -1;
      if (p.y < 0 || p.y > height) p.vy *= -1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.color + "," + p.alpha + ")";
      ctx.fill();
    });

    drawConnections();
    frameId = window.requestAnimationFrame(render);
  }

  window.addEventListener("resize", initializeParticles, { passive: true });
  window.addEventListener("beforeunload", function () {
    window.cancelAnimationFrame(frameId);
  }, { once: true });

  initializeParticles();
  render();
}

function initFadeObserver(prefersReducedMotion) {
  var fadeNodes = document.querySelectorAll(".fade-up");
  if (!fadeNodes.length) return;

  if (prefersReducedMotion) {
    fadeNodes.forEach(function (el) { el.classList.add("visible"); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  fadeNodes.forEach(function (el) { observer.observe(el); });
}

function initChatAnimation(prefersReducedMotion) {
  var messages = document.querySelectorAll(".chat-msg");
  if (!messages.length) return;

  if (prefersReducedMotion) {
    messages.forEach(function (el) { el.classList.add("visible"); });
    return;
  }

  var chatWindow = document.getElementById("chat-window");
  if (!chatWindow) return;

  var revealed = false;

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || revealed) return;
        revealed = true;

        messages.forEach(function (msg, i) {
          setTimeout(function () {
            msg.classList.add("visible");
          }, i * 350);
        });

        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15 }
  );

  observer.observe(chatWindow);
}

function initNavScroll() {
  var nav = document.getElementById("nav");
  if (!nav) return;

  function updateState() {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  }

  updateState();
  window.addEventListener("scroll", updateState, { passive: true });
}

function initMobileMenu() {
  var toggle = document.getElementById("mobile-toggle");
  var navLinks = document.getElementById("nav-links");

  if (!(toggle instanceof HTMLButtonElement) || !(navLinks instanceof HTMLElement)) return;

  function setExpanded(expanded) {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  toggle.addEventListener("click", function () {
    var isOpen = navLinks.classList.toggle("open");
    setExpanded(isOpen);
  });

  navLinks.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      navLinks.classList.remove("open");
      setExpanded(false);
    });
  });
}

function initCopyUrl() {
  var btn = document.getElementById("copy-url");
  var input = document.getElementById("mcp-url");
  if (!btn || !input) return;

  var copyIcon = btn.querySelector(".copy-icon");
  var checkIcon = btn.querySelector(".check-icon");

  function showCopied() {
    btn.classList.add("copied");
    if (copyIcon) copyIcon.style.display = "none";
    if (checkIcon) checkIcon.style.display = "block";
    setTimeout(function () {
      btn.classList.remove("copied");
      if (copyIcon) copyIcon.style.display = "block";
      if (checkIcon) checkIcon.style.display = "none";
    }, 2000);
  }

  function fallbackCopy() {
    input.select();
    input.setSelectionRange(0, 99999);
    document.execCommand("copy");
    showCopied();
  }

  btn.addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(showCopied).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  });

  input.addEventListener("click", function () {
    input.select();
  });
}
