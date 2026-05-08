// MCOP — Three.js matcap crystal scenes (config-aware)
// Reads window.MCOPConfig: { atmosphere, form, tempoMul } and rebuilds on change.

(function () {
  const T = window.THREE;

  // ------- Matcap generator -------
  function makeMatcap(stops, opts = {}) {
    const size = 256;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = stops[stops.length - 1][1];
    ctx.fillRect(0, 0, size, size);
    const cx = size / 2, cy = size / 2;
    const g = ctx.createRadialGradient(
      cx + (opts.lx || -30), cy + (opts.ly || -50), 0,
      cx, cy, size * 0.55
    );
    stops.forEach(([t, color]) => g.addColorStop(t, color));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2); ctx.fill();
    if (opts.spec !== false) {
      const sg = ctx.createRadialGradient(
        cx + (opts.sx || -40), cy + (opts.sy || -65), 0,
        cx + (opts.sx || -40), cy + (opts.sy || -65), size * 0.18
      );
      sg.addColorStop(0, "rgba(255,255,255,0.95)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }

  // Three palettes — each provides primary/secondary/tertiary matcaps + chain colors
  const palettes = {
    obsidian: {
      primary: makeMatcap([[0,"#f8eedd"],[0.18,"#a8c8e8"],[0.4,"#5a78c8"],[0.62,"#3a2a6a"],[0.85,"#1a0a2a"],[1,"#07070a"]],{lx:-40,ly:-60}),
      secondary: makeMatcap([[0,"#ffffff"],[0.25,"#e0e6ee"],[0.5,"#7a8090"],[0.78,"#26282e"],[1,"#080808"]],{lx:-25,ly:-60}),
      tertiary: makeMatcap([[0,"#fff5d8"],[0.22,"#f0c870"],[0.5,"#a07028"],[0.78,"#3a1f08"],[1,"#0a0604"]],{lx:-30,ly:-55}),
      cap: makeMatcap([[0,"#eafcff"],[0.22,"#88e4ff"],[0.5,"#1f7aa8"],[0.78,"#0a2238"],[1,"#040810"]],{lx:-30,ly:-55}),
      partColor: 0xf5e8c0,
      lineColor: 0xf5f1e8,
    },
    bone: {
      primary: makeMatcap([[0,"#ffffff"],[0.2,"#f0e4d0"],[0.5,"#b89878"],[0.78,"#5a4628"],[1,"#1a1208"]],{lx:-35,ly:-55}),
      secondary: makeMatcap([[0,"#ffffff"],[0.25,"#dfe5ec"],[0.5,"#9098a6"],[0.78,"#3a3e48"],[1,"#0c0e14"]],{lx:-25,ly:-50}),
      tertiary: makeMatcap([[0,"#fff8e8"],[0.22,"#e8c878"],[0.5,"#a06820"],[0.78,"#402008"],[1,"#0c0604"]],{lx:-30,ly:-55}),
      cap: makeMatcap([[0,"#ffffff"],[0.25,"#e0d8c8"],[0.5,"#a89880"],[0.78,"#4a3a28"],[1,"#180c04"]],{lx:-25,ly:-50}),
      partColor: 0x8a6a3a,
      lineColor: 0x1a1612,
    },
    plasma: {
      primary: makeMatcap([[0,"#ffffff"],[0.18,"#88f8ff"],[0.4,"#7b2dff"],[0.62,"#ff006e"],[0.85,"#1a002a"],[1,"#03020a"]],{lx:-40,ly:-50,sx:-50,sy:-60}),
      secondary: makeMatcap([[0,"#ffffff"],[0.22,"#ffe080"],[0.5,"#ff006e"],[0.78,"#3a0028"],[1,"#0a000a"]],{lx:-30,ly:-50}),
      tertiary: makeMatcap([[0,"#eafcff"],[0.22,"#00f0ff"],[0.5,"#1f7ad8"],[0.78,"#0a2278"],[1,"#040820"]],{lx:-30,ly:-55}),
      cap: makeMatcap([[0,"#fff5e8"],[0.22,"#ffd700"],[0.5,"#ff006e"],[0.78,"#7b2dff"],[1,"#03020a"]],{lx:-30,ly:-55}),
      partColor: 0x00f0ff,
      lineColor: 0xb39bff,
    },
  };

  function pal() {
    const a = (window.MCOPConfig && window.MCOPConfig.atmosphere) || "obsidian";
    return palettes[a] || palettes.obsidian;
  }
  function tempo() {
    return (window.MCOPConfig && window.MCOPConfig.tempoMul) || 1;
  }
  function formKey() {
    return (window.MCOPConfig && window.MCOPConfig.form) || "knot";
  }

  function makeHeroGeo(kind) {
    if (kind === "crystal") return new T.IcosahedronGeometry(1.35, 1);
    if (kind === "sphere") return new T.SphereGeometry(1.3, 96, 64);
    return new T.TorusKnotGeometry(1.05, 0.36, 320, 48, 2, 3);
  }

  function createScene(canvas, opts = {}) {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0, opts.camZ || 5);
    const target = new T.Vector2(), cur = new T.Vector2();
    function resize() {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(canvas); resize();
    return { renderer, scene, camera, target, cur };
  }

  // ============== HERO ==============
  function initHero() {
    const canvas = document.getElementById("hero-canvas");
    if (!canvas) return;
    const { renderer, scene, camera, target, cur } = createScene(canvas, { camZ: 5.6 });

    let knot = null;
    function rebuildHero() {
      if (knot) { scene.remove(knot); knot.geometry.dispose(); knot.material.dispose(); }
      const g = makeHeroGeo(formKey());
      const m = new T.MeshMatcapMaterial({ matcap: pal().primary });
      knot = new T.Mesh(g, m);
      scene.add(knot);
    }
    rebuildHero();

    const shardGroup = new T.Group();
    const shardGeos = [
      new T.OctahedronGeometry(0.18, 0),
      new T.IcosahedronGeometry(0.14, 0),
      new T.TetrahedronGeometry(0.16, 0),
    ];
    const shards = [];
    function rebuildShards() {
      shards.forEach((s) => { shardGroup.remove(s); s.material.dispose(); });
      shards.length = 0;
      for (let i = 0; i < 14; i++) {
        const g = shardGeos[i % shardGeos.length];
        const m = new T.MeshMatcapMaterial({ matcap: i % 3 === 0 ? pal().tertiary : pal().secondary });
        const s = new T.Mesh(g, m);
        const a = (i / 14) * Math.PI * 2;
        const r = 2.4 + (i % 3) * 0.4;
        s.userData = { a, r, y: (Math.random() - 0.5) * 1.8, spinX: Math.random() * 0.02 + 0.005, spinY: Math.random() * 0.02 + 0.005, bob: Math.random() * Math.PI * 2 };
        s.position.set(Math.cos(a) * r, s.userData.y, Math.sin(a) * r * 0.6);
        shardGroup.add(s); shards.push(s);
      }
    }
    rebuildShards();
    scene.add(shardGroup);

    window.addEventListener("mcop:config", () => { rebuildHero(); rebuildShards(); });
    window.addEventListener("pointermove", (e) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    });
    let scrollOffset = 0;
    window.addEventListener("scroll", () => { scrollOffset = window.scrollY * 0.001; }, { passive: true });

    const clock = new T.Clock();
    function tick() {
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      const m = tempo();
      cur.x += (target.x - cur.x) * 0.05;
      cur.y += (target.y - cur.y) * 0.05;
      knot.rotation.x = cur.y * 0.4 + t * 0.18 * m + scrollOffset * 2;
      knot.rotation.y = cur.x * 0.6 + t * 0.22 * m;
      knot.position.y = Math.sin(t * 0.5 * m) * 0.08 - scrollOffset * 1.2;
      knot.scale.setScalar(1 - Math.min(scrollOffset * 0.4, 0.4));
      shardGroup.rotation.y = t * 0.08 * m + cur.x * 0.2;
      shardGroup.rotation.x = cur.y * 0.15;
      shards.forEach((s) => {
        s.rotation.x += s.userData.spinX * m;
        s.rotation.y += s.userData.spinY * m;
        s.position.y = s.userData.y + Math.sin(t * 0.6 * m + s.userData.bob) * 0.18;
      });
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  }

  // ============== TRIAD ==============
  function initTriad() {
    document.querySelectorAll("[data-triad-canvas]").forEach((canvas) => {
      const kind = canvas.dataset.triadCanvas;
      const { renderer, scene, camera } = createScene(canvas, { camZ: 3.4 });
      let mesh = null, wire = null;
      function build() {
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
        if (wire) { scene.remove(wire); wire.geometry.dispose(); wire.material.dispose(); }
        let geo, matKey;
        if (kind === "encoder") { geo = new T.IcosahedronGeometry(1.05, 1); matKey = "primary"; }
        else if (kind === "stigmergy") { geo = new T.OctahedronGeometry(1.15, 0); matKey = "secondary"; }
        else { geo = new T.DodecahedronGeometry(1.05, 0); matKey = "tertiary"; }
        mesh = new T.Mesh(geo, new T.MeshMatcapMaterial({ matcap: pal()[matKey] }));
        scene.add(mesh);
        wire = new T.Mesh(
          geo.clone().scale(1.18, 1.18, 1.18),
          new T.MeshBasicMaterial({ color: pal().lineColor, wireframe: true, transparent: true, opacity: 0.07 })
        );
        scene.add(wire);
      }
      build();
      window.addEventListener("mcop:config", build);
      let hovered = false;
      const wrap = canvas.closest(".triad-card");
      if (wrap) {
        wrap.addEventListener("pointerenter", () => (hovered = true));
        wrap.addEventListener("pointerleave", () => (hovered = false));
      }
      const clock = new T.Clock();
      function tick() {
        const t = clock.elapsedTime;
        const m = tempo();
        const speed = (hovered ? 0.012 : 0.004) * m;
        mesh.rotation.x += speed;
        mesh.rotation.y += speed * 1.4;
        wire.rotation.x = mesh.rotation.x * -0.6;
        wire.rotation.y = mesh.rotation.y * -0.6;
        mesh.position.y = Math.sin(t * 0.7 * m) * 0.05;
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      }
      tick();
    });
  }

  // ============== CHAIN ==============
  function initChain() {
    const canvas = document.getElementById("chain-canvas");
    if (!canvas) return;
    const { renderer, scene, camera } = createScene(canvas, { camZ: 6 });
    const group = new T.Group();
    scene.add(group);
    const nodes = [];
    const total = 5;
    let line, lineGeo, points, partGeo, partMat, lineMat;
    function build() {
      // dispose existing
      while (group.children.length) {
        const c = group.children[0];
        group.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
      nodes.length = 0;
      for (let i = 0; i < total; i++) {
        const g = new T.IcosahedronGeometry(0.34, 0);
        const m = new T.MeshMatcapMaterial({
          matcap: i === 0 ? pal().cap : i === total - 1 ? pal().tertiary : pal().primary,
        });
        const mesh = new T.Mesh(g, m);
        const x = (i - (total - 1) / 2) * 1.55;
        mesh.position.set(x, 0, 0);
        mesh.userData = { i, baseX: x, phase: i * 0.7 };
        group.add(mesh); nodes.push(mesh);
      }
      lineGeo = new T.BufferGeometry().setFromPoints(nodes.map((n) => n.position.clone()));
      lineMat = new T.LineBasicMaterial({ color: pal().lineColor, transparent: true, opacity: 0.18 });
      line = new T.Line(lineGeo, lineMat);
      group.add(line);
      partGeo = new T.BufferGeometry();
      const partPos = new Float32Array(24 * 3);
      partGeo.setAttribute("position", new T.BufferAttribute(partPos, 3));
      partMat = new T.PointsMaterial({ color: pal().partColor, size: 0.06, transparent: true, opacity: 0.95 });
      points = new T.Points(partGeo, partMat);
      group.add(points);
    }
    build();
    window.addEventListener("mcop:config", build);

    const clock = new T.Clock();
    function tick() {
      const t = clock.elapsedTime;
      const m = tempo();
      group.rotation.y = Math.sin(t * 0.15 * m) * 0.22;
      group.rotation.x = Math.sin(t * 0.1 * m) * 0.08;
      nodes.forEach((n) => {
        n.rotation.x = t * 0.4 * m + n.userData.phase;
        n.rotation.y = t * 0.5 * m + n.userData.phase;
        n.position.y = Math.sin(t * 0.8 * m + n.userData.phase) * 0.08;
      });
      lineGeo.setFromPoints(nodes.map((n) => n.position));
      const partPos = partGeo.attributes.position.array;
      for (let i = 0; i < 24; i++) {
        const u = ((t * 0.25 * m + i / 24) % 1) * (total - 1);
        const seg = Math.floor(u);
        const f = u - seg;
        const a = nodes[seg].position;
        const b = nodes[Math.min(seg + 1, total - 1)].position;
        partPos[i * 3] = a.x + (b.x - a.x) * f;
        partPos[i * 3 + 1] = a.y + (b.y - a.y) * f + Math.sin(t * 2 * m + i) * 0.04;
        partPos[i * 3 + 2] = a.z + (b.z - a.z) * f;
      }
      partGeo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
      requestAnimationFrame(tick);
    }
    tick();
  }

  function boot() { initHero(); initTriad(); initChain(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
