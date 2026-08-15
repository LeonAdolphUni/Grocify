/* ═══════════════════════════════════════════════════════════════════
   Grocify — Landingpage
   Interaktionsstufe L2 nach DESIGN.md. Keine Abhängigkeiten:
   IntersectionObserver, requestAnimationFrame, sonst nichts.
   ═══════════════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover)').matches;

  /* ── Blütenblätter zeichnen ──────────────────────────────────────
     Dieselbe Idee wie src/ui/Sunflower.tsx: von zwölf Blättern sind so
     viele gelb, wie die Verwertungsquote hergibt. 85 % → 10 von 12. */

  const NS = 'http://www.w3.org/2000/svg';

  function drawPetals(group, count, filled) {
    for (let i = 0; i < count; i++) {
      const petal = document.createElementNS(NS, 'ellipse');
      petal.setAttribute('cx', '56');
      petal.setAttribute('cy', '17');
      petal.setAttribute('rx', '6.5');
      petal.setAttribute('ry', '15');
      petal.setAttribute('fill', i < filled ? 'var(--accent)' : 'var(--petal-off)');
      petal.setAttribute('transform', `rotate(${(360 / count) * i} 56 56)`);
      group.appendChild(petal);
    }
  }

  const UTILIZATION = 0.85;

  document.querySelectorAll('.sunflower__petals').forEach((g) =>
    drawPetals(g, 12, Math.round(UTILIZATION * 12)),
  );
  // Das Navigationszeichen ist dieselbe Blume in klein, immer voll.
  document.querySelectorAll('.mark__petals').forEach((g) => drawPetals(g, 12, 12));

  // Blättchenreihe in der Bento-Kachel — zehn Stück, wie in der App
  document.querySelectorAll('.petals').forEach((row) => {
    const filled = Math.round(UTILIZATION * 10);
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span');
      if (i < filled) s.dataset.on = 'true';
      row.appendChild(s);
    }
  });

  /* ── Scroll-Reveal ───────────────────────────────────────────────
     Ein Observer für die ganze Seite. Sichtbar gewordene Elemente
     werden abgemeldet — sonst beobachtet der Browser bis zum Schluss
     Dinge, die sich nie wieder ändern. */

  const targets = document.querySelectorAll('[data-reveal]');

  if (reduced) {
    targets.forEach((el) => (el.dataset.visible = 'true'));
  } else {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.dataset.visible = 'true';
          io.unobserve(e.target);
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' },
    );
    targets.forEach((el) => io.observe(el));
  }

  /* ── Navigationszustand ──────────────────────────────────────────
     Über einen Wächter ganz oben statt über einen scroll-Listener:
     kostet nichts und feuert nicht bei jedem Pixel. */

  const nav = document.querySelector('.nav');
  const sentinel = document.querySelector('#top-sentinel');

  if (nav && sentinel) {
    new IntersectionObserver(
      ([e]) => { nav.dataset.scrolled = String(!e.isIntersecting); },
      { threshold: 0 },
    ).observe(sentinel);
  }

  /* ── Aktiver Navigationspunkt ────────────────────────────────── */

  const sections = document.querySelectorAll('main section[id]');
  const linkFor = new Map();
  document.querySelectorAll('.nav__link').forEach((a) => {
    linkFor.set(a.getAttribute('href').slice(1), a);
  });

  const navIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const link = linkFor.get(e.target.id);
        if (!link) continue;
        linkFor.forEach((l) => l.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'true');
      }
    },
    { threshold: 0.35 },
  );
  sections.forEach((s) => navIo.observe(s));

  /* ── Kennzahlen hochzählen ───────────────────────────────────────
     Erst wenn die Zahl sichtbar ist. Eine Zahl, die im Verborgenen
     hochgezählt hat, ist beim Ankommen schon fertig — und damit
     wirkungslos. */

  function countUp(el) {
    const target = Number(el.dataset.count);
    const decimals = Number(el.dataset.decimals ?? 0);
    const suffix = el.dataset.suffix ?? '';

    const write = (v) => {
      el.textContent = v.toFixed(decimals).replace('.', ',') + suffix;
    };

    if (reduced) { write(target); return; }

    const start = performance.now();
    const dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      write(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const statIo = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        countUp(e.target);
        statIo.unobserve(e.target);
      }
    },
    { threshold: 0.6 },
  );
  document.querySelectorAll('[data-count]').forEach((el) => statIo.observe(el));

  /* ── Spotlight auf Karten ────────────────────────────────────────
     EIN Listener für die ganze Seite, passiv und rAF-gedrosselt.
     Ein Listener je Karte wäre bei acht Karten achtmal so teuer, und
     ungedrosselt feuert pointermove öfter als der Bildschirm zeichnet. */

  if (canHover && !reduced) {
    let queued = false;
    let px = 0, py = 0;

    document.addEventListener(
      'pointermove',
      (ev) => {
        px = ev.clientX;
        py = ev.clientY;
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          const el = document.elementFromPoint(px, py);
          const card = el && el.closest ? el.closest('.card') : null;
          if (!card) return;
          const r = card.getBoundingClientRect();
          card.style.setProperty('--mx', `${px - r.left}px`);
          card.style.setProperty('--my', `${py - r.top}px`);
        });
      },
      { passive: true },
    );
  }

  /* ── Sanfte Parallaxe auf der Blüte ──────────────────────────────
     Höchstens 40 px Versatz. Mehr wirkt seekrank und kostet Repaints. */

  const art = document.querySelector('.hero__art');
  if (art && !reduced) {
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          const shift = Math.max(-40, Math.min(40, window.scrollY * 0.06));
          art.style.transform = `translate3d(0, ${shift}px, 0)`;
        });
      },
      { passive: true },
    );
  }

  /* ── Kees blinzelt ───────────────────────────────────────────────
     Ein Maskottchen, das sich nie bewegt, ist ein Aufkleber. Alle neun
     Sekunden ein Lidschlag, bei Zeigerkontakt sofort — und dann sagt
     er etwas anderes. */

  const SPRUECHE = [
    'Kwak! Sauber geplant.',
    'Solide. Ein Rest ist erlaubt.',
    '85 % — davon lebe ich.',
    'Die halbe Packung? Wirklich?',
    'Kwak.',
  ];

  function blink(eyes) {
    if (!eyes || reduced) return;
    eyes.dataset.blink = 'true';
    setTimeout(() => { eyes.dataset.blink = 'false'; }, 120);
  }

  document.querySelectorAll('.kees__eyes').forEach((eyes) => {
    if (reduced) return;
    // Versetzt starten, damit die beiden Frösche nicht im Gleichtakt blinzeln
    const offset = Math.random() * 4000;
    setTimeout(() => { setInterval(() => blink(eyes), 9000); }, offset);
  });

  const kees = document.querySelector('#kees');
  const bubble = document.querySelector('#kees-bubble');
  if (kees && bubble) {
    let n = 0;
    kees.addEventListener('pointerenter', () => {
      blink(kees.querySelector('.kees__eyes'));
      n = (n + 1) % SPRUECHE.length;
      bubble.textContent = SPRUECHE[n];
    });
  }
})();
