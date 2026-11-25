// Promo video director. Runs inside index.html (loaded by the recorder), plays a scripted tour of the
// app on a virtual clock, draws captions over each frame and encodes a 1080p MP4 with WebCodecs.
// Every frame is rendered and encoded one by one, so the result is smooth however slow the machine is.
// Output: PUT to /assets/top/out/promo.mp4 (the dev server's upload folder).
window.__promo = (async () => {
  const S = window.__cat, cv = document.getElementById('c');
  const status = window.__promoStatus = { frame: 0, scene: 'start', done: false, error: null };
  const OW = 1920, OH = 1080, FPS = 30;
  const { Muxer, ArrayBufferTarget } = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs');

  // ---- set up: fixed render size, paused live loop, virtual clock, clean default state
  window.__pause = true;
  window.__setRes(OW, Math.round(OW / (cv.clientWidth / cv.clientHeight)));
  window.__clock = 1000;
  const click = sel => document.querySelector(sel)?.click();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function breed(id) { click(`[data-breed=${id}]`); for (let i = 0; i < 200 && S.breed !== id; i++) await wait(50); }
  async function reset(pose = 'side', comfort = 0.1) {
    S.demo = null; S.down = false; S.over = false; S.grabbing = false;
    S.pose = pose; S.flopping = false; S.flop = 0; S.comfort = comfort; S.lift = 0; S.tailTime = 0;
    S.lastPet = -99; S.lastTail = -99;
  }
  if (S.nightOn) click('#nightBtn');
  S.night = 0;
  document.getElementById('size').value = 1; document.getElementById('fat').value = 0;
  document.getElementById('size').dispatchEvent(new Event('input'));
  await breed('shorthair'); click('[data-coat=ginger]');
  await reset();
  window.__sim(2);                                     // settle camera & breathing

  // ---- encoder
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: OW, height: OH, frameRate: FPS }, fastStart: 'in-memory' });
  const enc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { status.error = String(e); } });
  enc.configure({ codec: 'avc1.640028', width: OW, height: OH, bitrate: 12e6, framerate: FPS });
  const out = document.createElement('canvas'); out.width = OW; out.height = OH;
  const g = out.getContext('2d');

  // ---- overlays
  const ease = k => k * k * (3 - 2 * k);
  const fade = (t, dur, inT = 0.45, outT = 0.45) => Math.min(ease(Math.min(1, t / inT)), ease(Math.min(1, Math.max(0, (dur - t) / outT))));
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function caption(title, sub, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a;
    g.font = '700 64px "Segoe UI", system-ui, sans-serif'; const tw = g.measureText(title).width;
    g.font = '400 32px "Segoe UI", system-ui, sans-serif'; const sw = sub ? g.measureText(sub).width : 0;
    const w = Math.max(tw, sw) + 80, h = sub ? 168 : 116, x = 72, y = OH - h - 72 + (1 - a) * 18;
    g.fillStyle = 'rgba(28,20,14,.62)'; roundRect(x, y, w, h, 26); g.fill();
    g.fillStyle = '#e9a15c'; roundRect(x, y + 26, 8, h - 52, 4); g.fill();
    g.fillStyle = '#fff'; g.font = '700 64px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'top';
    g.fillText(title, x + 40, y + 24);
    if (sub) { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '400 32px "Segoe UI", system-ui, sans-serif'; g.fillText(sub, x + 40, y + 106); }
    g.restore();
  }
  function titleCard(title, sub, line3, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a;
    const gr = g.createLinearGradient(0, 0, 0, OH); gr.addColorStop(0, 'rgba(20,14,10,.15)'); gr.addColorStop(0.5, 'rgba(20,14,10,.55)'); gr.addColorStop(1, 'rgba(20,14,10,.15)');
    g.fillStyle = gr; g.fillRect(0, 0, OW, OH);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24;
    g.font = '800 150px "Segoe UI", system-ui, sans-serif'; g.fillText(title, OW / 2, OH / 2 - 60);
    g.font = '400 46px "Segoe UI", system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(sub, OW / 2, OH / 2 + 60);
    if (line3) { g.font = '600 34px "Segoe UI", system-ui, sans-serif'; g.fillStyle = '#f2c58a'; g.fillText(line3, OW / 2, OH / 2 + 135); }
    g.restore();
  }

  // ---- render loop
  let overlay = () => {};
  async function emit() {
    window.__sim(1 / FPS);                               // advance the app 1/30 s and draw it
    g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, OW, OH);
    overlay();
    const f = new VideoFrame(out, { timestamp: Math.round(status.frame * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(f, { keyFrame: status.frame % (FPS * 2) === 0 }); f.close();
    status.frame++;
    if (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
    if (status.frame % 15 === 0) await wait(0);         // let the page breathe
  }
  // play `sec` seconds; each(k, t) runs before every frame; ov(t) draws the overlay
  async function scene(name, sec, ov, each) {
    status.scene = name; const n = Math.round(sec * FPS);
    for (let k = 0; k < n; k++) { const t = k / FPS; if (each) each(k, t); overlay = () => ov && ov(t, sec); await emit(); }
  }
  const cap = (title, sub) => (t, d) => caption(title, sub, fade(t, d));

  // ---- text (window.__promoLang = 'en' | 'vi')
  const LANG = window.__promoLang || 'en';
  const TXT = {
    en: { title:'Pet the Cat', tag:'A realistic cat you can actually pet',
          s1:['Stroke its back', 'It relaxes, purrs, and its fur follows your hand'],
          s2:['Scratch above the tail', 'It stands up and raises its hips'],
          s3:['Grab the tail', 'It follows your hand, then swishes back'],
          s4:['Keep petting…', '…and it rolls onto its back'],
          breeds:['Persian', 'Maine Coon', 'Sphynx', 'British Shorthair', 'Bengal', 'Ragdoll', 'Orange shorthair'], of:'breeds',
          coats:['13 coat colours', 'Tabby, calico, tuxedo, Siamese and more'],
          shape:['Size & body shape', 'From slim to chubby, kitten-sized to big'],
          night:['Night mode', 'Moonlight and a warm lamp'],
          endSub:'Stroke it. Scratch it. Watch it purr.', endLine:'7 breeds · 13 coats · night mode · English & Tiếng Việt' },
    vi: { title:'Vuốt ve mèo', tag:'Chú mèo chân thật mà bạn có thể vuốt ve',
          s1:['Vuốt lưng mèo', 'Mèo thư giãn, gừ gừ, lông xuôi theo tay bạn'],
          s2:['Gãi phía trên đuôi', 'Mèo đứng dậy và nhổm mông lên'],
          s3:['Nắm đuôi', 'Đuôi đi theo tay bạn rồi vẫy trở lại'],
          s4:['Cứ vuốt ve tiếp…', '…mèo sẽ lật ngửa bụng'],
          breeds:['Mèo Ba Tư', 'Mèo Maine Coon', 'Mèo không lông Sphynx', 'Mèo Anh lông ngắn', 'Mèo Bengal', 'Mèo Ragdoll', 'Mèo mướp lông ngắn'], of:'giống mèo',
          coats:['13 màu lông', 'Mướp, tam thể, đen trắng, mèo Xiêm và nhiều nữa'],
          shape:['Kích thước & dáng mèo', 'Từ thon gọn đến mũm mĩm, từ nhỏ xíu đến to bự'],
          night:['Chế độ đêm', 'Ánh trăng và đèn ngủ ấm áp'],
          endSub:'Vuốt ve. Gãi gãi. Nghe mèo gừ gừ.', endLine:'7 giống mèo · 13 màu lông · chế độ đêm · Tiếng Việt & English' },
  }[LANG];

  // 1. title over the dozing cat
  await scene('intro', 4, (t, d) => titleCard(TXT.title, TXT.tag, null, fade(t, d, 0.6, 0.7)));

  // 2. stroke the back
  window.__demo('stroke');
  await scene('stroke', 6, cap(...TXT.s1));

  // 3. scratch above the tail -> stands up, hips raised
  S.demo = null; S.down = false; S.comfort = 0.4;
  window.__demo('scratch');
  await scene('scratch', 6, cap(...TXT.s2));
  S.demo = null; S.down = false; S.over = false;
  await scene('liedown', 2.6, null);

  // 4. grab the tail
  window.__demo('grab');
  await scene('grab', 5, cap(...TXT.s3));

  // 5. keep petting -> belly up
  S.demo = null; S.down = false; S.comfort = 0.45;
  window.__demo('belly');
  let bellyFor = 0;
  await scene('belly', 7.5, cap(...TXT.s4), (k) => { if (S.pose === 'belly') bellyFor++; });

  // 6. breeds montage (alternating lying and standing)
  const breeds = ['persian', 'mainecoon', 'sphynx', 'british', 'bengal', 'ragdoll', 'shorthair'].map((id, i) => [id, TXT.breeds[i]]);
  for (const [i, [id, name]] of breeds.entries()) {
    await breed(id);
    const stand = i % 2 === 1;
    await reset(stand ? 'hipsup' : 'side', 0.25);
    if (stand) { S.lastTail = window.__clock; S.tailTime = 1; }
    window.__sim(0.6);
    await scene('breed-' + id, 1.5, () => caption(name, `${i + 1} / 7 ${TXT.of}`, 1), () => { if (stand) { S.lastTail = window.__clock; S.tailTime = 1; } });
  }

  // 7. coat colours on the shorthair
  await reset('side', 0.2);
  const coats = [...document.querySelectorAll('.sw')].map(b => b.dataset.coat);
  await scene('coats', coats.length * 0.42, () => caption(...TXT.coats, 1),
    (k, t) => { const c = coats[Math.min(coats.length - 1, Math.floor(t / 0.42))]; if (S.coat !== c) click(`[data-coat=${c}]`); });
  click('[data-coat=ginger]');

  // 8. size & body shape
  const sizeIn = document.getElementById('size'), fatIn = document.getElementById('fat');
  await scene('shape', 4, cap(...TXT.shape), (k, t) => {
    const p = t / 4; fatIn.value = Math.sin(p * Math.PI * 2) * 0.9; sizeIn.value = 1 + 0.12 * Math.sin(p * Math.PI * 2 + 1.2);
    sizeIn.dispatchEvent(new Event('input'));
  });
  sizeIn.value = 1; fatIn.value = 0; sizeIn.dispatchEvent(new Event('input'));

  // 9. night mode
  click('#nightBtn');
  await scene('night', 4, cap(...TXT.night));
  click('#nightBtn');
  await scene('day', 1.2, null);

  // 10. end card
  await scene('end', 4.5, (t, d) => titleCard(TXT.title, TXT.endSub, TXT.endLine, fade(t, d, 0.6, 0.01)));

  // ---- finish
  status.scene = 'encoding';
  await enc.flush(); muxer.finalize();
  const buf = muxer.target.buffer;
  const res = await fetch('/assets/top/out/promo-' + LANG + '.mp4', { method: 'PUT', body: buf });
  status.bytes = buf.byteLength; status.put = res.status; status.done = true; status.scene = 'done';
  window.__clock = null; window.__pause = false; window.__layout();
})().catch(e => { window.__promoStatus.error = String(e && e.stack || e); window.__pause = false; window.__clock = null; });
