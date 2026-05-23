// MCOP — UI animations: counters, copy interactions, scroll reveals, ticker

(function () {
  // -------- Counter animation on intersect --------
  const counters = document.querySelectorAll("[data-count]");
  const counterObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = parseFloat(el.dataset.count);
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const dur = parseInt(el.dataset.dur || "1600", 10);
        const start = performance.now();
        const from = 0;
        function step(now) {
          const t = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          const v = from + (target - from) * eased;
          el.textContent = decimals
            ? v.toFixed(decimals)
            : Math.round(v).toLocaleString();
          if (t < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        counterObs.unobserve(el);
      });
    },
    { threshold: 0.4 }
  );
  counters.forEach((c) => counterObs.observe(c));

  // -------- Reveal on intersect --------
  const reveals = document.querySelectorAll("[data-reveal]");
  const revealObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          revealObs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  reveals.forEach((r) => revealObs.observe(r));

  // -------- Hash ticker (live-feeling SHA-256 churn) --------
  // NOTE: the hex strings rendered here are PURELY DECORATIVE — they animate
  // a "live cryptographic ledger" feel and are never used as identifiers,
  // tokens, signatures, or anything security-sensitive. We use the Web
  // Crypto API anyway so static analyzers (e.g. CodeQL js/insecure-randomness)
  // don't have to second-guess intent.
  const hex = "0123456789abcdef";
  const _cryptoBuf = new Uint8Array(64);
  _cryptoBuf._i = _cryptoBuf.length;
  function _csprngByte() {
    if (_cryptoBuf._i >= _cryptoBuf.length) {
      crypto.getRandomValues(_cryptoBuf);
      _cryptoBuf._i = 0;
    }
    return _cryptoBuf[_cryptoBuf._i++];
  }
  function randHex(n) {
    let s = "";
    for (let i = 0; i < n; i++) s += hex[_csprngByte() & 0x0f];
    return s;
  }
  const hashEls = document.querySelectorAll("[data-hash]");
  function tickHashes() {
    hashEls.forEach((el) => {
      const len = parseInt(el.dataset.hash || "16", 10);
      el.textContent = randHex(len);
    });
  }
  tickHashes();
  setInterval(tickHashes, 1500);

  // -------- Copy install command --------
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const txt = btn.dataset.copy;
      navigator.clipboard?.writeText(txt);
      const orig = btn.dataset.label || btn.textContent;
      btn.textContent = "copied";
      btn.classList.add("is-copied");
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove("is-copied");
      }, 1400);
    });
  });

  // -------- Header — translucent on scroll --------
  const header = document.querySelector(".site-header");
  if (header) {
    window.addEventListener(
      "scroll",
      () => {
        header.classList.toggle("is-floated", window.scrollY > 24);
      },
      { passive: true }
    );
  }

  // -------- Live clock for the provenance line --------
  const clockEl = document.getElementById("live-iso");
  if (clockEl) {
    function paint() {
      const d = new Date();
      clockEl.textContent = d.toISOString().split(".")[0] + "Z";
    }
    paint();
    setInterval(paint, 1000);
  }

  // -------- Resonance meter — pseudo-random walk --------
  const meter = document.getElementById("resonance-bar");
  const meterVal = document.getElementById("resonance-val");
  if (meter && meterVal) {
    let v = 0.94;
    setInterval(() => {
      v += (Math.random() - 0.5) * 0.012;
      v = Math.max(0.88, Math.min(0.998, v));
      meter.style.transform = `scaleX(${v})`;
      meterVal.textContent = v.toFixed(4);
    }, 220);
  }

  // -------- Marquee duplicate for seamless loop --------
  document.querySelectorAll("[data-marquee]").forEach((m) => {
    m.innerHTML += m.innerHTML;
  });
})();
