// Saisonale Wettereffekte: Schnee im Hintergrund, abschaltbar über den Schalter im Header.
// Der Canvas liegt über den farbigen Section-Hintergründen, aber unter allen Inhalten.
(() => {
  // Wann welcher Effekt läuft (jedes Jahr, "MM-TT", beide Tage inklusive)
  const SEASONS = [{ effect: "snow", from: "11-01", until: "12-31" }];
  const STORAGE_KEY = "gerda-weather";

  // Zum Testen lokal: ?heute=2026-12-24 (wie in script.js)
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const testDay = isLocal ? new URLSearchParams(location.search).get("heute") : null;
  const todayKey = /^\d{4}-\d{2}-\d{2}$/.test(testDay ?? "")
    ? testDay
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
  const monthDay = todayKey.slice(5);
  const season = SEASONS.find((s) => s.from <= monthDay && monthDay <= s.until);
  if (!season) return;

  const header = document.querySelector(".site-header");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const readSetting = () => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };
  const saveSetting = (on) => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {}
  };

  const stored = readSetting();
  let enabled = stored ? stored === "on" : !reduceMotion.matches;

  // --- Canvas ---
  const canvas = document.createElement("canvas");
  canvas.className = "weather";
  canvas.setAttribute("aria-hidden", "true");
  // Ans Ende: positionierte Sections ohne z-index (Hero, Kontakt) malen in DOM-Reihenfolge,
  // der Canvas muss also nach ihnen kommen, um über ihrem Hintergrund zu liegen.
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let flakes = [];
  let frame = null;
  let last = 0;

  // --- Flocken-Sprites: einmal vorzeichnen, dann nur noch kopieren ---
  const SPRITE = 64;
  const ARM = 26;
  const makeSprite = (drawArm) => {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = SPRITE;
    const c = sprite.getContext("2d");
    c.translate(SPRITE / 2, SPRITE / 2);
    c.strokeStyle = c.fillStyle = "#fff";
    c.lineWidth = 4;
    c.lineCap = c.lineJoin = "round";
    // Weicher dunkler Schatten, damit die Flocken auch auf Creme sichtbar sind
    c.shadowColor = "rgba(44, 48, 60, 0.75)";
    c.shadowBlur = 4;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      c.save();
      c.rotate((i * Math.PI) / 3);
      drawArm(c);
      c.restore();
    }
    c.stroke();
    return sprite;
  };
  const line = (c, x1, y1, x2, y2) => {
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
  };
  // Seitenäste als V an Position t (0–1 entlang des Arms), Länge l
  const branch = (c, t, l) => {
    const y = -ARM * t;
    line(c, 0, y, -l * 0.8, y - l);
    line(c, 0, y, l * 0.8, y - l);
  };
  const sprites = [
    // Klassisch: zwei Paar Seitenäste
    makeSprite((c) => {
      line(c, 0, 0, 0, -ARM);
      branch(c, 0.4, 8);
      branch(c, 0.7, 6);
    }),
    // Farnartig: drei kleine Paare und Gabel an der Spitze
    makeSprite((c) => {
      line(c, 0, 0, 0, -ARM);
      branch(c, 0.3, 5);
      branch(c, 0.55, 6);
      branch(c, 0.8, 4);
    }),
    // Sternplatte: Sechseck in der Mitte, Arme mit Pfeilspitze
    makeSprite((c) => {
      const h = 8;
      line(c, 0, -h, h * Math.sin(Math.PI / 3), -h * Math.cos(Math.PI / 3));
      line(c, 0, -h, 0, -ARM);
      branch(c, 0.75, 7);
    }),
  ];
  // Kleine, ferne Flocken bleiben Pünktchen
  const dot = (() => {
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = 16;
    const c = sprite.getContext("2d");
    c.fillStyle = "#fff";
    c.shadowColor = "rgba(44, 48, 60, 0.75)";
    c.shadowBlur = 3;
    c.arc(8, 8, 4, 0, Math.PI * 2);
    c.fill();
    return sprite;
  })();

  const makeFlake = (anywhere) => {
    const crystal = Math.random() < 0.7;
    // r = Radius in CSS-Pixeln
    const r = crystal ? 4 + Math.random() ** 1.5 * 6 : 1.2 + Math.random() * 1.3;
    return {
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : -r * 2,
      r,
      sprite: crystal ? sprites[Math.floor(Math.random() * sprites.length)] : dot,
      // Sprite-Pixel pro CSS-Pixel
      scale: crystal ? r / ARM : r / 4,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * (crystal ? 1.2 : 0),
      speed: 16 + r * 5 + Math.random() * 12,
      sway: 6 + Math.random() * 16,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 0.8,
      alpha: 0.6 + Math.random() * 0.35,
    };
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const count = Math.min(150, Math.round((width * height) / 10000));
    while (flakes.length < count) flakes.push(makeFlake(true));
    flakes.length = count;
  };

  const draw = (time) => {
    const dt = Math.min((time - (last || time)) / 1000, 0.05);
    last = time;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const f of flakes) {
      f.y += f.speed * dt;
      f.phase += f.freq * dt;
      f.angle += f.spin * dt;
      const x = f.x + Math.sin(f.phase) * f.sway;
      if (f.y - f.r * 2 > height) Object.assign(f, makeFlake(false));
      if (x < -20) f.x += width + 40;
      if (x > width + 20) f.x -= width + 40;

      const k = dpr * f.scale;
      const cos = Math.cos(f.angle) * k;
      const sin = Math.sin(f.angle) * k;
      const half = f.sprite.width / 2;
      ctx.setTransform(cos, sin, -sin, cos, x * dpr, f.y * dpr);
      ctx.globalAlpha = f.alpha;
      ctx.drawImage(f.sprite, -half, -half);
    }
    ctx.globalAlpha = 1;
    frame = requestAnimationFrame(draw);
  };

  const start = () => {
    if (frame || document.hidden) return;
    last = 0;
    frame = requestAnimationFrame(draw);
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
  };

  const apply = () => {
    canvas.hidden = !enabled;
    toggle.setAttribute("aria-checked", String(enabled));
    if (enabled) start();
    else {
      stop();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // --- Schalter im Header ---
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "weather-toggle";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Wettereffekte");
  toggle.title = "Wettereffekte an/aus";
  toggle.innerHTML = `
    <svg class="weather-toggle__icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 19h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 10 4.5 4.5 0 0 0 9 19Z" />
      <path d="M11 24v5M8.8 25.2l4.4 2.6M13.2 25.2l-4.4 2.6" />
      <path d="M21 23v4M19.3 24l3.4 2M22.7 24l-3.4 2" />
    </svg>
    <span class="weather-toggle__track"><span class="weather-toggle__thumb"></span></span>`;
  toggle.addEventListener("click", () => {
    enabled = !enabled;
    saveSetting(enabled);
    apply();
  });

  // Zustand setzen, bevor der Schalter sichtbar wird (sonst animiert er beim Laden)
  resize();
  apply();
  header?.append(toggle);

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (enabled) start();
  });
})();
