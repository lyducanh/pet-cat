// Promo video director. Runs inside index.html, plays a scripted tour of the app on a virtual clock
// with its own camera moves, animated captions, particles and cut transitions, and encodes a 1080p
// MP4 with WebCodecs. Every frame is rendered and encoded one by one, so the result is smooth
// however slow the machine is. Set window.__promoLang = 'en' | 'vi' before running.
// Output: PUT to /assets/top/out/promo-<lang>.mp4 (the dev server's upload folder).
window.__promo = (async () => {
  const S = window.__cat, cv = document.getElementById('c');
  const status = window.__promoStatus = { frame: 0, scene: 'start', done: false, error: null };
  const OW = 1920, OH = 1080, FPS = 30, DT = 1 / FPS;
  const LANG = window.__promoLang || 'en';
  const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs');

  // ---------------------------------------------------------------- text
  const TXT = {
    en: { title:'Pet the Cat', tag:'A realistic cat you can actually pet', kicker:'Gesture',
          s1:['Stroke its back', 'It relaxes, purrs, and its fur follows your hand'],
          s2:['Scratch above the tail', 'It stands up and raises its hips'],
          s3:['Grab the tail', 'It follows your hand, then swishes back'],
          s4:['Keep petting…', '…and it rolls onto its back'],
          purr:'purr~', breedsHead:'7 breeds',
          breeds:['Persian', 'Maine Coon', 'Sphynx', 'British Shorthair', 'Bengal', 'Ragdoll', 'Orange shorthair'],
          coats:['13 coat colours', 'Tabby, calico, tuxedo, Siamese and more'],
          shape:['Size & body shape', 'From slim to chubby, kitten-sized to big'],
          night:['Night mode', 'Moonlight and a warm lamp'],
          endSub:'Stroke it. Scratch it. Watch it purr.', cta:'Play free in your browser',
          endLine:'7 breeds · 13 coats · night mode · English & Tiếng Việt' },
    vi: { title:'Vuốt ve mèo', tag:'Chú mèo chân thật mà bạn có thể vuốt ve', kicker:'Cử chỉ',
          s1:['Vuốt lưng mèo', 'Mèo thư giãn, gừ gừ, lông xuôi theo tay bạn'],
          s2:['Gãi phía trên đuôi', 'Mèo đứng dậy và nhổm mông lên'],
          s3:['Nắm đuôi', 'Đuôi đi theo tay bạn rồi vẫy trở lại'],
          s4:['Cứ vuốt ve tiếp…', '…mèo sẽ lật ngửa bụng'],
          purr:'gừ gừ~', breedsHead:'7 giống mèo',
          breeds:['Mèo Ba Tư', 'Mèo Maine Coon', 'Mèo không lông Sphynx', 'Mèo Anh lông ngắn', 'Mèo Bengal', 'Mèo Ragdoll', 'Mèo mướp lông ngắn'],
          coats:['13 màu lông', 'Mướp, tam thể, đen trắng, mèo Xiêm và nhiều nữa'],
          shape:['Kích thước & dáng mèo', 'Từ thon gọn đến mũm mĩm, từ nhỏ xíu đến to bự'],
          night:['Chế độ đêm', 'Ánh trăng và đèn ngủ ấm áp'],
          endSub:'Vuốt ve. Gãi gãi. Nghe mèo gừ gừ.', cta:'Chơi miễn phí ngay trên trình duyệt',
          endLine:'7 giống mèo · 13 màu lông · chế độ đêm · Tiếng Việt & English' },
  }[LANG];
  const URL = 'lyducanh.github.io/pet-cat';

  // ---------------------------------------------------------------- set up the app
  window.__pause = true;
  window.__setRes(OW, Math.round(OW / window.__aspect()));
  window.__clock = 1000;
  const A = window.__aspect();
  const click = sel => document.querySelector(sel)?.click();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function breed(id) { click(`[data-breed=${id}]`); for (let i = 0; i < 200 && S.breed !== id; i++) await wait(50); }
  function reset(pose = 'side', comfort = 0.1) {
    S.demo = null; S.down = false; S.over = false; S.grabbing = false;
    S.pose = pose; S.flopping = false; S.flop = 0; S.comfort = comfort; S.lift = 0; S.tailTime = 0;
    S.lastPet = -99; S.lastTail = -99;
  }
  if (S.nightOn) click('#nightBtn');
  S.night = 0;
  const sizeIn = document.getElementById('size'), fatIn = document.getElementById('fat');
  sizeIn.value = 1; fatIn.value = 0; sizeIn.dispatchEvent(new Event('input'));
  await breed('shorthair'); click('[data-coat=ginger]');
  reset();
  window.__sim(2);

  // ---------------------------------------------------------------- camera (scripted)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const easeOut = k => { k = clamp(k, 0, 1); return 1 - Math.pow(1 - k, 3); };
  const back = k => { k = clamp(k, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
  const W = (name, key) => window.__world(key || (S.flopping ? (S.flop > 0.5 ? S.flopTo : S.flopFrom) : S.pose), name);
  let camFn = null, camS = null, sceneT = 0;
  function fit(c) {                              // keep the room filling the frame (also when rolled)
    const z = Math.max(c[2], 1.02 + Math.abs(c[3]) * 1.3);
    const mx = Math.max(0, A / 2 * (1 - 1 / z) - Math.abs(c[3]) * 0.55), my = Math.max(0, 0.5 * (1 - 1 / z) - Math.abs(c[3]) * 0.95);
    return [clamp(c[0], A / 2 - mx, A / 2 + mx), clamp(c[1], 0.5 - my, 0.5 + my), z, c[3]];
  }
  window.__camOverride = () => camS;
  function stepCam(snap) {                        // the scripted target, lightly smoothed (a camera operator)
    if (!camFn) return;
    const t = fit(camFn(sceneT));
    if (!camS || snap) camS = t.slice();
    else for (let i = 0; i < 4; i++) camS[i] = lerp(camS[i], t[i], 1 - Math.exp(-DT / 0.22));
  }

  // ---------------------------------------------------------------- encoder & canvas
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: OW, height: OH, frameRate: FPS }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { status.error = String(e); } });
  enc.configure({ codec: 'avc1.640028', width: OW, height: OH, bitrate: 12e6, framerate: FPS });
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const g = out.getContext('2d');
  const FONT = '"Segoe UI", system-ui, sans-serif';
  const toPx = w => { const s = window.__worldToScreen(w); return [s[0] * OW, s[1] * OH]; };
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------------------------------------------------------------- particles (hearts, purr bubbles, sparkles)
  const parts = [];
  function heart(x, y, big = 1) {
    parts.push({ kind: 'heart', x, y, vx: (Math.random() - 0.5) * 40, vy: -(70 + Math.random() * 60) * big, life: 0, max: 1.6 + Math.random() * 0.6,
                 size: (26 + Math.random() * 18) * big, rot: (Math.random() - 0.5) * 0.5, hue: Math.random() < 0.5 ? '#ff6f7d' : '#ff9a6b' });
  }
  function bubble(x, y, text) { parts.push({ kind: 'text', x, y, vx: 10, vy: -40, life: 0, max: 1.5, text }); }
  function sparkle(x, y) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * 280, vy: Math.sin(a) * 280, life: 0, max: 0.55 }); } }
  function drawHeart(x, y, s, rot, col, a) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(s / 32, s / 32); g.globalAlpha = a;
    g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-26, -8, -12, -30, 0, -14); g.bezierCurveTo(12, -30, 26, -8, 0, 10); g.closePath();
    g.shadowColor = 'rgba(255,90,110,.55)'; g.shadowBlur = 14; g.fillStyle = col; g.fill();
    g.shadowBlur = 0; g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke(); g.restore();
  }
  function drawParts() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += DT; if (p.life > p.max) { parts.splice(i, 1); continue; }
      p.x += p.vx * DT; p.y += p.vy * DT; const k = p.life / p.max;
      if (p.kind === 'heart') { p.vx += Math.sin(p.life * 5) * 6; drawHeart(p.x, p.y, p.size * (0.6 + 0.4 * easeOut(k * 4)), p.rot, p.hue, Math.min(1, (1 - k) * 2)); }
      else if (p.kind === 'spark') { p.vx *= 0.88; p.vy *= 0.88; g.save(); g.globalAlpha = 1 - k; g.fillStyle = '#fff4c8'; g.beginPath(); g.arc(p.x, p.y, 7 * (1 - k) + 2, 0, 7); g.fill(); g.restore(); }
      else {
        g.save(); g.globalAlpha = Math.min(1, (1 - k) * 2.2) * easeOut(k * 5);
        g.font = `italic 600 38px ${FONT}`; const w = g.measureText(p.text).width + 36;
        g.fillStyle = 'rgba(255,255,255,.92)'; rr(p.x - w / 2, p.y - 30, w, 56, 28); g.fill();
        g.fillStyle = '#c2622b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.text, p.x, p.y - 2); g.restore();
      }
    }
  }

  // ---------------------------------------------------------------- captions & cards
  // lower third: kicker chip, title revealed word by word, subtitle sliding in after it
  function caption(title, sub, t, d, kicker) {
    const a = Math.min(easeOut(t / 0.35), ease((d - t) / 0.4));
    if (a <= 0) return;
    g.save();
    g.font = `800 70px ${FONT}`; const tw = g.measureText(title).width;
    g.font = `400 34px ${FONT}`; const sw = sub ? g.measureText(sub).width : 0;
    const w = Math.max(tw, sw) + 92, h = sub ? 184 : 126, x = 80 - (1 - easeOut(t / 0.45)) * 90, y = OH - h - 80;
    g.globalAlpha = a;
    g.fillStyle = 'rgba(24,17,12,.66)'; rr(x, y, Math.max(60, w * easeOut(t / 0.45)), h, 30); g.fill();
    g.fillStyle = '#ef9b4f'; rr(x, y + 28, 9, Math.max(1, (h - 56) * easeOut((t - 0.1) / 0.4)), 4); g.fill();
    if (kicker) {
      g.font = `700 24px ${FONT}`; const kw = g.measureText(kicker).width + 30;
      g.globalAlpha = a * easeOut((t - 0.05) / 0.3); g.fillStyle = '#ef9b4f'; rr(x + 44, y - 22, kw, 40, 20); g.fill();
      g.fillStyle = '#2a1a0f'; g.textBaseline = 'middle'; g.fillText(kicker, x + 59, y - 1);
    }
    g.textBaseline = 'top'; g.font = `800 70px ${FONT}`; let cx = x + 44;
    title.split(' ').forEach((word, i) => {
      const k = easeOut((t - 0.12 - i * 0.07) / 0.3);
      g.globalAlpha = a * k; g.fillStyle = '#fff'; g.fillText(word, cx, y + 26 + (1 - k) * 26); cx += g.measureText(word + ' ').width;
    });
    if (sub) { const k = easeOut((t - 0.45) / 0.4); g.globalAlpha = a * k; g.fillStyle = 'rgba(255,255,255,.86)'; g.font = `400 34px ${FONT}`; g.fillText(sub, x + 44 + (1 - k) * 30, y + 116); }
    g.restore();
  }
  // big centred name that pops in (breeds montage)
  function bigName(name, kicker, t, d) {
    const a = Math.min(easeOut(t / 0.2), ease((d - t) / 0.2)), s = back(t / 0.45);
    g.save(); g.globalAlpha = a; g.translate(OW / 2, OH - 170); g.scale(s, s);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 92px ${FONT}`; const w = g.measureText(name).width + 110;
    g.fillStyle = 'rgba(24,17,12,.62)'; rr(-w / 2, -70, w, 140, 70); g.fill();
    g.fillStyle = '#fff'; g.fillText(name, 0, 2);
    g.font = `700 26px ${FONT}`; const kw = g.measureText(kicker).width + 34;
    g.fillStyle = '#ef9b4f'; rr(-kw / 2, -96, kw, 42, 21); g.fill(); g.fillStyle = '#2a1a0f'; g.fillText(kicker, 0, -75);
    g.restore();
  }
  // title card: letters drop in one by one, then the tagline, then (end) a call-to-action pill
  function titleCard(title, sub, t, d, end) {
    const a = Math.min(ease(t / 0.4), end ? 1 : ease((d - t) / 0.6));
    if (a <= 0) return;
    g.save(); g.globalAlpha = a;
    const gr = g.createRadialGradient(OW / 2, OH / 2, 100, OW / 2, OH / 2, OW * 0.7);
    gr.addColorStop(0, 'rgba(20,14,10,.62)'); gr.addColorStop(1, 'rgba(20,14,10,.2)'); g.fillStyle = gr; g.fillRect(0, 0, OW, OH);
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `900 160px ${FONT}`;
    const chars = [...title], total = g.measureText(title).width; let x = OW / 2 - total / 2;
    g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 30;
    chars.forEach((ch, i) => {
      const k = back((t - 0.15 - i * 0.045) / 0.5), w = g.measureText(ch).width;
      g.save(); g.globalAlpha = a * clamp((t - 0.15 - i * 0.045) / 0.2, 0, 1);
      g.translate(x + w / 2, OH / 2 - 70 - (1 - k) * 80); g.scale(Math.max(0.01, k), Math.max(0.01, k)); g.fillStyle = '#fff'; g.fillText(ch, -w / 2, 0); g.restore();
      x += w;
    });
    g.shadowBlur = 0; g.textAlign = 'center';
    const k2 = easeOut((t - 0.9) / 0.5); g.globalAlpha = a * k2;
    g.font = `400 48px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.94)'; g.fillText(sub, OW / 2, OH / 2 + 50 + (1 - k2) * 20);
    if (end) {
      const k3 = back((t - 1.4) / 0.55), bob = Math.sin(t * 3) * 4;
      g.save(); g.globalAlpha = a * clamp((t - 1.4) / 0.25, 0, 1); g.translate(OW / 2, OH / 2 + 160 + bob); g.scale(Math.max(0.01, k3), Math.max(0.01, k3));
      g.font = `700 40px ${FONT}`; const w = g.measureText(TXT.cta).width + 120;
      const pg = g.createLinearGradient(-w / 2, 0, w / 2, 0); pg.addColorStop(0, '#f2b56b'); pg.addColorStop(1, '#e27a3e');
      g.fillStyle = pg; rr(-w / 2, -42, w, 84, 42); g.fill();
      g.fillStyle = '#fff'; g.fillText('▶  ' + TXT.cta, 0, 2); g.restore();
      const k4 = easeOut((t - 1.9) / 0.5); g.globalAlpha = a * k4;
      g.font = `600 36px ${FONT}`; g.fillStyle = '#ffd9a8'; g.fillText(URL, OW / 2, OH / 2 + 250);
      g.font = `400 28px ${FONT}`; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(TXT.endLine, OW / 2, OH / 2 + 300);
    }
    g.restore();
  }
  function letterbox(k) { if (k <= 0) return; const h = 110 * k; g.fillStyle = '#000'; g.fillRect(0, 0, OW, h); g.fillRect(0, OH - h, OW, h); }
  // swatch strip for the coats scene (colours read from the app's own swatch buttons)
  function swatches(btns, cur, t) {
    const n = btns.length, r = 30, gap = 22, w = n * (2 * r) + (n - 1) * gap, x0 = OW / 2 - w / 2, y = 120;
    g.save(); g.globalAlpha = easeOut(t / 0.4);
    g.fillStyle = 'rgba(24,17,12,.55)'; rr(x0 - 30, y - r - 20, w + 60, 2 * r + 40, r + 20); g.fill();
    btns.forEach((b, i) => {
      const cx = x0 + r + i * (2 * r + gap), on = i === cur, s = on ? 1.25 : 1;
      const m = getComputedStyle(b).backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{6}/gi) || ['#ccc'];
      g.save(); g.translate(cx, y); g.scale(s, s);
      if (m.length >= 3 && /conic|linear/.test(getComputedStyle(b).backgroundImage)) {
        m.forEach((c, j) => { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, j / m.length * 7, (j + 1) / m.length * 7 + 0.02); g.closePath(); g.fillStyle = c; g.fill(); });
      } else {
        const grad = g.createRadialGradient(-8, -8, 2, 0, 0, r);
        grad.addColorStop(0, m[0]); grad.addColorStop(0.6, m[Math.min(1, m.length - 1)]); grad.addColorStop(1, m[m.length - 1]);
        g.fillStyle = grad; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      }
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.lineWidth = on ? 5 : 2; g.strokeStyle = on ? '#ef9b4f' : 'rgba(255,255,255,.6)'; g.stroke(); g.restore();
    });
    g.restore();
  }

  // ---------------------------------------------------------------- frame loop
  let overlay = () => {}, cutT = 99, flash = 0;
  function cut(strength = 0.35) { cutT = 0; flash = strength; }
  async function emit() {
    stepCam(false);
    window.__sim(DT);
    // punch-in after a cut: the frame settles from a slight zoom, with a quick warm-white flash
    const p = cutT < 0.3 ? 1 + 0.06 * (1 - easeOut(cutT / 0.3)) : 1;
    g.save(); g.translate(OW / 2, OH / 2); g.scale(p, p); g.drawImage(cv, 0, 0, cv.width, cv.height, -OW / 2, -OH / 2, OW, OH); g.restore();
    drawParts();
    overlay();
    if (cutT < 0.3 && flash > 0) { g.fillStyle = `rgba(255,248,236,${flash * (1 - cutT / 0.3)})`; g.fillRect(0, 0, OW, OH); }
    cutT += DT;
    const f = new VideoFrame(out, { timestamp: Math.round(status.frame * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: status.frame % (FPS * 2) === 0 }); f.close();
    status.frame++;
    if (enc.encodeQueueSize > 6) await wait(5);
    if (status.frame % 15 === 0) await wait(0);
  }
  async function scene(name, sec, { cam, ov, each, snap } = {}) {
    status.scene = name; camFn = cam || camFn; sceneT = 0; stepCam(!!snap);
    const n = Math.round(sec * FPS);
    for (let k = 0; k < n; k++) { sceneT = k * DT; if (each) each(sceneT, k); overlay = () => ov && ov(sceneT, sec); await emit(); }
  }
  const hand = () => S.handS;
  const near = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  let lastHeart = 0, lastPurr = 0;

  // 1. intro: letterboxed crane down onto the sleeping cat, title letters drop in
  await scene('intro', 4.6, { snap: true,
    cam: t => { const b = W('belly'), k = ease(t / 4.6); return [lerp(A / 2, b[0], k), lerp(0.5, b[1], k), lerp(1.04, 1.32, k), lerp(0.05, 0, k)]; },
    ov: (t, d) => { letterbox(1 - ease((t - 3.6) / 0.8)); titleCard(TXT.title, TXT.tag, t, d); } });

  // 2. stroke: close on the head, the camera follows the hand along the back; hearts and purrs
  cut(0.3);
  window.__demo('stroke');
  await scene('stroke', 6.2, {
    cam: t => { const hd = W('head'), h = hand(), c = near(hd, h, 0.55); return [c[0], c[1] + 0.02, lerp(1.85, 1.5, ease(t / 6)), -0.03]; },
    ov: (t, d) => caption(...TXT.s1, t, d, TXT.kicker + ' 1/4'),
    each: t => {
      if (S.down && t - lastHeart > 0.32) { lastHeart = t; const p = toPx(hand()); heart(p[0] + (Math.random() - 0.5) * 80, p[1] - 30); }
      if (t > 1.8 && t - lastPurr > 1.6) { lastPurr = t; const p = toPx(W('head')); bubble(p[0] + 40, p[1] - 90, TXT.purr); }
    } });

  // 3. scratch: tight on the rump, pull back to reveal the cat standing with its hips up
  cut(0.3); lastHeart = 0;
  S.demo = null; S.down = false; S.comfort = 0.4;
  window.__demo('scratch');
  let stood = false;
  await scene('scratch', 6.4, {
    cam: t => { const hip = W('hip', 'side'), b = W('belly'), k = ease((t - 0.7) / 1.5); const c = near(hip, b, k); return [c[0], c[1], lerp(2.0, 1.28, k), lerp(0.03, 0, k)]; },
    ov: (t, d) => caption(...TXT.s2, t, d, TXT.kicker + ' 2/4'),
    each: t => {
      if (!stood && S.pose === 'hipsup') { stood = true; const p = toPx(W('hip')); sparkle(p[0], p[1]); for (let i = 0; i < 6; i++) heart(p[0] + (Math.random() - 0.5) * 160, p[1], 1.2); }
      if (S.down && t - lastHeart > 0.45) { lastHeart = t; const p = toPx(hand()); heart(p[0], p[1] - 40, 0.8); }
    } });
  S.demo = null; S.down = false; S.over = false;
  await scene('liedown', 2.4, { cam: t => { const b = W('belly'); return [b[0] + 0.03 * t, b[1], lerp(1.28, 1.15, ease(t / 2.4)), 0]; } });

  // 4. grab the tail: a tilted (dutch) angle that tracks the tail
  cut(0.3);
  window.__demo('grab');
  await scene('grab', 5.2, {
    cam: t => { const tp = S.tailPts ? S.tailPts[Math.round(S.tailPts.length * 0.55)] : W('tailBase'), b = W('belly'); const c = near(b, tp, 0.65); return [c[0], c[1], 1.6, 0.06 * Math.sin(t * 0.8) + 0.03]; },
    ov: (t, d) => caption(...TXT.s3, t, d, TXT.kicker + ' 3/4') });

  // 5. keep petting: a slow orbit around the cat until it rolls belly-up, then a burst of hearts
  cut(0.3); lastHeart = 0;
  S.demo = null; S.down = false; S.comfort = 0.45;
  window.__demo('belly');
  let rolled = false;
  await scene('belly', 7.6, {
    cam: t => { const b = W('belly'); return [b[0] + 0.04 * Math.sin(t * 0.6), b[1] + 0.02 * Math.cos(t * 0.6), lerp(1.25, 1.42, ease(t / 7.6)), lerp(0.07, -0.04, ease(t / 7.6))]; },
    ov: (t, d) => caption(...TXT.s4, t, d, TXT.kicker + ' 4/4'),
    each: t => {
      if (S.down && t - lastHeart > 0.4) { lastHeart = t; const p = toPx(hand()); heart(p[0], p[1] - 40, 0.9); }
      if (!rolled && S.pose === 'belly') { rolled = true; const p = toPx(W('belly')); for (let i = 0; i < 12; i++) heart(p[0] + (Math.random() - 0.5) * 420, p[1] + (Math.random() - 0.5) * 120, 1.3); }
    } });

  // 6. breeds: quick punchy cuts, alternating lying / standing, alternating pan direction
  const breeds = ['persian', 'mainecoon', 'sphynx', 'british', 'bengal', 'ragdoll', 'shorthair'];
  for (const [i, id] of breeds.entries()) {
    await breed(id);
    const stand = i % 2 === 1;
    reset(stand ? 'hipsup' : 'side', 0.25);
    if (stand) { S.lastTail = window.__clock; S.tailTime = 1; }
    window.__sim(0.5);
    cut(0.45);
    const dir = i % 2 ? 1 : -1;
    await scene('breed-' + id, 1.55, { snap: true,
      cam: t => { const b = W('belly'); return [b[0] + dir * lerp(-0.05, 0.05, t / 1.55), b[1], lerp(1.42, 1.2, easeOut(t / 0.6)), dir * 0.015]; },
      ov: (t, d) => bigName(TXT.breeds[i], `${TXT.breedsHead} · ${i + 1}/7`, t, d),
      each: () => { if (stand) { S.lastTail = window.__clock; S.tailTime = 1; } } });
  }

  // 7. coats: the cat in every coat, a swatch strip on top, a little zoom pulse on each change
  reset('side', 0.2);
  cut(0.35);
  const sw = [...document.querySelectorAll('.sw')], coats = sw.map(b => b.dataset.coat), per = 0.42;
  let pulseT = 9;
  await scene('coats', coats.length * per, { snap: true,
    cam: t => { const b = W('belly'); return [b[0], b[1], 1.22 + 0.035 * Math.exp(-pulseT * 8), 0]; },
    ov: (t, d) => { swatches(sw, Math.min(coats.length - 1, Math.floor(t / per)), t); caption(...TXT.coats, t, d); },
    each: t => { pulseT += DT; const c = coats[Math.min(coats.length - 1, Math.floor(t / per))]; if (S.coat !== c) { click(`[data-coat=${c}]`); pulseT = 0; } } });
  click('[data-coat=ginger]');

  // 8. size & body shape: slow pull back while the cat grows, shrinks, slims and fattens
  cut(0.3);
  await scene('shape', 4.2, {
    cam: t => { const b = W('belly'); return [lerp(b[0], A / 2, ease(t / 4.2)), lerp(b[1], 0.5, ease(t / 4.2)), lerp(1.38, 1.03, ease(t / 4.2)), 0]; },
    ov: (t, d) => caption(...TXT.shape, t, d),
    each: t => { const p = t / 4.2; fatIn.value = Math.sin(p * Math.PI * 2) * 0.9; sizeIn.value = 1 + 0.12 * Math.sin(p * Math.PI * 2 + 1.2); sizeIn.dispatchEvent(new Event('input')); } });
  sizeIn.value = 1; fatIn.value = 0; sizeIn.dispatchEvent(new Event('input'));

  // 9. night: lights go down while the camera pushes in to the sleeping face
  cut(0.2);
  click('#nightBtn');
  await scene('night', 4.4, {
    cam: t => { const hd = W('head'), b = W('belly'), c = near(b, hd, ease(t / 4.4) * 0.7); return [c[0], c[1], lerp(1.15, 1.75, ease(t / 4.4)), -0.02]; },
    ov: (t, d) => caption(...TXT.night, t, d) });
  click('#nightBtn');
  await scene('day', 1.3, { cam: t => { const b = W('belly'); return [lerp(b[0], A / 2, ease(t / 1.3)), lerp(b[1], 0.5, ease(t / 1.3)), lerp(1.4, 1.06, ease(t / 1.3)), 0]; } });

  // 10. end card with call to action
  await scene('end', 5.2, {
    cam: t => [A / 2 + 0.01 * t, 0.5, 1.06 + 0.015 * t, 0],
    ov: (t, d) => { letterbox(ease(t / 0.8)); titleCard(TXT.title, TXT.endSub, t, d, true); } });

  // ---------------------------------------------------------------- finish
  status.scene = 'encoding';
  await enc.flush(); muxer.finalize();
  const buf = muxer.target.buffer;
  const res = await fetch('/assets/top/out/promo-' + LANG + '.mp4', { method: 'PUT', body: buf });
  status.bytes = buf.byteLength; status.put = res.status; status.done = true; status.scene = 'done';
  window.__camOverride = null; window.__clock = null; window.__pause = false; window.__layout();
})().catch(e => { window.__promoStatus.error = String(e && e.stack || e); window.__camOverride = null; window.__pause = false; window.__clock = null; });
