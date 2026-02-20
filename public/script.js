(function initLandingPage() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  initCanvas(prefersReducedMotion);
  initFadeObserver(prefersReducedMotion);
  initNavScroll();
  initMobileMenu();
})();

function initCanvas(prefersReducedMotion) {
  if (prefersReducedMotion) return;

  const canvas = document.getElementById("pulse-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let particles = [];
  let frameId = 0;

  const COLORS = ["124,92,252", "0,212,255", "200,80,242"];
  const MAX_PARTICLES = 120;
  const DIST_LIMIT = 140;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.4 + 0.1,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  function initializeParticles() {
    resize();
    const count = Math.min(Math.floor((width * height) / 12000), MAX_PARTICLES);
    particles = Array.from({ length: count }, createParticle);
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < DIST_LIMIT) {
          const alpha = (1 - distance / DIST_LIMIT) * 0.12;
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

    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      if (particle.x < 0 || particle.x > width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > height) particle.vy *= -1;

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + particle.color + "," + particle.alpha + ")";
      ctx.fill();
    });

    drawConnections();
    frameId = window.requestAnimationFrame(render);
  }

  window.addEventListener(
    "resize",
    () => {
      initializeParticles();
    },
    { passive: true }
  );

  window.addEventListener("beforeunload", () => window.cancelAnimationFrame(frameId), { once: true });

  initializeParticles();
  render();
}

function initFadeObserver(prefersReducedMotion) {
  const fadeNodes = document.querySelectorAll(".fade-up");
  if (!fadeNodes.length) return;

  if (prefersReducedMotion) {
    fadeNodes.forEach((el) => el.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  fadeNodes.forEach((el) => observer.observe(el));
}

function initNavScroll() {
  const nav = document.getElementById("nav");
  if (!nav) return;

  const updateState = () => {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  };

  updateState();
  window.addEventListener("scroll", updateState, { passive: true });
}

function initMobileMenu() {
  const toggle = document.getElementById("mobile-toggle");
  const navLinks = document.getElementById("nav-links");

  if (!(toggle instanceof HTMLButtonElement) || !(navLinks instanceof HTMLElement)) return;

  const setExpanded = (expanded) => {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
  };

  toggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    setExpanded(isOpen);
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("open");
      setExpanded(false);
    });
  });
}
