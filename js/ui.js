// ==========================================================================
// cash-map — Small UI helpers: scroll lock, count-up numbers, view animations
// ==========================================================================

// ---- Scroll lock (prevents the page behind sheets/onboarding from scrolling) ----
const scrollLocks = new Set();

export function lockScroll(key) {
  scrollLocks.add(key);
  document.documentElement.classList.add('scroll-locked');
}

export function unlockScroll(key) {
  scrollLocks.delete(key);
  if (scrollLocks.size === 0) {
    document.documentElement.classList.remove('scroll-locked');
  }
}

// ---- Count-up animation for key amounts ----
const countUpMemory = new Map();

function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Animates every [data-countup] element inside root from its last shown value
 * (or 0 on first appearance) to its new value.
 */
export function animateCountUps(root, formatFn) {
  root.querySelectorAll('[data-countup]').forEach((el) => {
    const key = el.getAttribute('data-countup-key') || 'default';
    const to = Number(el.getAttribute('data-countup'));
    if (!Number.isFinite(to)) return;

    const hasPrev = countUpMemory.has(key);
    const from = hasPrev ? countUpMemory.get(key) : 0;
    countUpMemory.set(key, to);
    if (prefersReducedMotion() || Math.abs(from - to) < 0.005) return;

    const duration = hasPrev ? 480 : 850;
    const start = performance.now();
    el.textContent = formatFn(from, el);

    const tick = (now) => {
      if (!el.isConnected) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatFn(t < 1 ? from + (to - from) * eased : to, el);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ---- Restartable view animations (tab fade / month slide) ----
export function restartAnimation(el, cls) {
  el.classList.remove('anim-fade', 'anim-next', 'anim-prev');
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(cls);
}
