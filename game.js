(function () {
  'use strict';

  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var elMeters = document.getElementById('meters');
  var elBest = document.getElementById('best');
  var elMsg = document.getElementById('msg');
  var elTitle = document.getElementById('msgTitle');
  var elText = document.getElementById('msgText');
  var elHint = document.getElementById('msgHint');

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // ---------- view ----------
  var W = 0, H = 0, S = 1, VW = 420, VH = 240, GY = 190;
  function resize() {
    var r = cv.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    W = cv.width; H = cv.height;
    S = Math.min(W / 420, H / 240);
    VW = W / S; VH = H / S;
    GY = VH - 46;
  }
  window.addEventListener('resize', resize);

  // ---------- constants (world units, seconds) ----------
  var SPEED = 150, GRAV = 1400, JUMP = 520;
  var PW = 22, PH = 34, R = 58;
  var UNIT_PER_M = 20;
  var PRESS_CYCLE = 2.2, PRESS_TOP = 110;

  // ---------- state ----------
  var state = 'ready'; // ready | play | over
  var p, c, bins, rollers, presses, nextX, startX, elapsed, rollerTimer, overAt, shownM = -1;
  var input = { go: false, jumpBuf: 0 };
  var auto = { go: false, jump: false }; // a bot plays whichever role nobody took
  var best = 0;
  try { best = parseInt(localStorage.getItem('falafel-best') || '0', 10) || 0; } catch (e) {}

  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function reset() {
    p = { x: 0, alt: 0, vy: 0, grounded: true, coyote: 0, stun: 0, invul: 0, walk: 0, moving: false };
    c = { x: -300, v: 80, rot: 0 };
    bins = []; rollers = []; presses = [];
    startX = 0; nextX = 260; elapsed = 0; rollerTimer = 6; shownM = -1;
    input.jumpBuf = 0;
  }

  function meters() { return Math.max(0, Math.floor((p.x - startX) / UNIT_PER_M)); }

  function spawn() {
    var d = (nextX - startX) / UNIT_PER_M;
    var r = Math.random(), w;
    if (d > 40 && r < 0.22) { w = 38; presses.push({ x: nextX, w: w, ph: Math.random() * PRESS_CYCLE }); }
    else if (r < 0.52) { w = 26; bins.push({ x: nextX, w: w, h: 34, k: 0 }); }
    else if (r < 0.74) { w = 26; bins.push({ x: nextX, w: w, h: 54, k: 1 }); }
    else { w = 58; bins.push({ x: nextX, w: w, h: 30, k: 2 }); }
    nextX += w + 150 + Math.random() * 170 - Math.min(60, d * 0.4);
  }

  function pressBottom(pr) {
    var t = (elapsed + pr.ph) % PRESS_CYCLE;
    if (t < 1.1) return PRESS_TOP;
    if (t < 1.25) return PRESS_TOP * (1 - (t - 1.1) / 0.15);
    if (t < 1.75) return 0;
    return PRESS_TOP * ((t - 1.75) / 0.45);
  }
  function pressWarn(pr) {
    var t = (elapsed + pr.ph) % PRESS_CYCLE;
    return t > 0.7 && t < 1.1;
  }

  function overlapX(x, o) { return x + PW / 2 > o.x && x - PW / 2 < o.x + o.w; }

  // ---------- bot for a free role ----------
  function autoGoOk() {
    for (var i = 0; i < presses.length; i++) {
      var pr = presses[i], d = pr.x - (p.x + PW / 2);
      if (d > -pr.w - PW && d < 26) {
        if (overlapX(p.x, pr)) return true;
        if (pressBottom(pr) < PRESS_TOP - 1 || pressWarn(pr)) return false;
      }
    }
    return true;
  }
  function needJump(vx) {
    var i, d;
    if (vx > 0) {
      for (i = 0; i < bins.length; i++) {
        d = bins[i].x - (p.x + PW / 2);
        if (d >= 0 && d < 30 && p.alt < bins[i].h - 3) return true;
      }
    }
    for (i = 0; i < rollers.length; i++) {
      d = rollers[i].x - p.x;
      if (d > 0 && d < rollers[i].r + PW / 2 + (120 + vx) * 0.22) return true;
    }
    return false;
  }

  function hit() {
    p.stun = 0.4; p.invul = 0.9;
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  }

  function setMsg(title, text, hint) {
    if (!title) { elMsg.hidden = true; return; }
    elTitle.textContent = title; elText.textContent = text; elHint.textContent = hint;
    elMsg.hidden = false;
  }

  function gameOver() {
    state = 'over'; overAt = performance.now();
    var m = meters();
    var isBest = m > best;
    if (isBest) { best = m; try { localStorage.setItem('falafel-best', String(best)); } catch (e) {} }
    elBest.textContent = 'best ' + best + ' m';
    setMsg(isBest ? 'New record' : 'The falafel got you',
           'You ran ' + m + ' m',
           'Press any button to play again');
    try { if (navigator.vibrate) navigator.vibrate([80, 60, 160]); } catch (e) {}
  }

  // ---------- update ----------
  function update(dt) {
    if (state !== 'play') return;
    elapsed += dt;

    // horizontal
    var vx = 0;
    if (p.stun > 0) { vx = -170; p.stun -= dt; }
    else if (input.go || (auto.go && autoGoOk())) vx = SPEED;
    if (p.invul > 0) p.invul -= dt;
    p.moving = vx > 0;
    var nx = p.x + vx * dt, i, b, pr, pb;

    for (i = 0; i < bins.length; i++) {
      b = bins[i];
      if (overlapX(nx, b) && p.alt < b.h - 3) {
        if (vx > 0) nx = b.x - PW / 2 - 0.01;
        else if (vx < 0) nx = b.x + b.w + PW / 2 + 0.01;
      }
    }
    for (i = 0; i < presses.length; i++) {
      pr = presses[i]; pb = pressBottom(pr);
      if (pb < p.alt + PH && overlapX(nx, pr) && !overlapX(p.x, pr)) {
        if (vx > 0) nx = pr.x - PW / 2 - 0.01;
        else if (vx < 0) nx = pr.x + pr.w + PW / 2 + 0.01;
      }
    }
    p.x = nx;
    if (p.moving && p.grounded) p.walk += dt * 16;

    // vertical
    var floor = 0;
    for (i = 0; i < bins.length; i++) {
      b = bins[i];
      if (overlapX(p.x, b) && p.alt >= b.h - 3) floor = Math.max(floor, b.h);
    }
    if (auto.jump && p.grounded && p.stun <= 0 && needJump(vx)) input.jumpBuf = 0.1;
    if (input.jumpBuf > 0) input.jumpBuf -= dt;
    if (input.jumpBuf > 0 && p.coyote > 0 && p.stun <= 0) {
      p.vy = JUMP; p.coyote = 0; input.jumpBuf = 0; p.grounded = false;
    }
    p.vy -= GRAV * dt;
    var nalt = p.alt + p.vy * dt;
    if (nalt <= floor) { nalt = floor; p.vy = 0; p.grounded = true; p.coyote = 0.09; }
    else { p.grounded = false; p.coyote -= dt; }
    p.alt = nalt;

    // presses crush
    if (p.invul <= 0) {
      for (i = 0; i < presses.length; i++) {
        pr = presses[i];
        if (overlapX(p.x, pr) && pressBottom(pr) < p.alt + PH) { hit(); break; }
      }
    }

    // rollers
    rollerTimer -= dt;
    if (rollerTimer <= 0 && meters() > 12) {
      rollers.push({ x: p.x + VW * 0.6 + 40, r: 11, alt: 0, rot: 0 });
      rollerTimer = 3.2 + Math.random() * 3;
    }
    for (i = rollers.length - 1; i >= 0; i--) {
      var ro = rollers[i];
      ro.x -= 120 * dt; ro.rot -= 120 * dt / ro.r;
      var target = 0;
      for (var j = 0; j < bins.length; j++) {
        b = bins[j];
        if (ro.x + ro.r > b.x && ro.x - ro.r < b.x + b.w) target = Math.max(target, b.h);
      }
      ro.alt += (target - ro.alt) * Math.min(1, dt * 18);
      if (p.invul <= 0 && Math.abs(ro.x - p.x) < ro.r + PW / 2 - 2 &&
          p.alt < ro.alt + ro.r * 2 - 4 && p.alt + PH > ro.alt) {
        hit(); rollers.splice(i, 1); continue;
      }
      if (ro.x < c.x) rollers.splice(i, 1);
    }

    // chaser
    c.v = Math.min(175, 80 + elapsed * 0.9);
    c.x += c.v * dt;
    if (c.x < p.x - 300) c.x = p.x - 300;
    c.rot = c.x / R;
    if (c.x + R * 0.75 > p.x - PW / 2) { gameOver(); return; }

    // world upkeep
    var camRight = p.x + VW;
    while (nextX < camRight + 120) spawn();
    var cut = c.x - 40;
    bins = bins.filter(function (o) { return o.x + o.w > cut; });
    presses = presses.filter(function (o) { return o.x + o.w > cut; });

    var m = meters();
    if (m !== shownM) { shownM = m; elMeters.firstChild.nodeValue = String(m); }
  }

  // ---------- draw helpers ----------
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }

  function drawBackground(camX) {
    var i, x;
    // sun
    ctx.fillStyle = '#ffe1ad';
    circle(VW * 0.74, GY - 30, 36); ctx.fill();

    // far hill
    var off = camX * 0.12;
    ctx.fillStyle = '#4a1f6b';
    ctx.beginPath(); ctx.moveTo(0, GY);
    for (x = 0; x <= VW + 12; x += 12) {
      var y = GY - 62 - 26 * Math.sin((x + off) * 0.012) - 12 * Math.sin((x + off) * 0.031);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VW + 12, GY); ctx.closePath(); ctx.fill();

    // buildings
    off = camX * 0.35;
    var bw = 46, i0 = Math.floor(off / bw) - 1, n = Math.ceil(VW / bw) + 2;
    for (i = i0; i < i0 + n; i++) {
      x = i * bw - off;
      var hgt = 28 + hash(i) * 64;
      ctx.fillStyle = '#2d1552';
      ctx.fillRect(x, GY - hgt, bw - 6, hgt);
      ctx.fillStyle = 'rgba(255,214,120,.85)';
      var rows = Math.floor((hgt - 10) / 14);
      for (var rw = 0; rw < rows; rw++) {
        for (var cl = 0; cl < 3; cl++) {
          if (hash(i * 31 + rw * 7 + cl * 3) > 0.58) ctx.fillRect(x + 6 + cl * 11, GY - hgt + 8 + rw * 14, 6, 7);
        }
      }
    }

    // ground
    ctx.fillStyle = '#160d33';
    ctx.fillRect(0, GY, VW, VH - GY + 4);
    ctx.fillStyle = '#ff3d8b';
    ctx.fillRect(0, GY, VW, 2.5);
    ctx.fillStyle = 'rgba(255,244,230,.2)';
    var o = ((camX % 40) + 40) % 40;
    for (x = -o; x < VW; x += 40) ctx.fillRect(x, GY + 18, 18, 3);
  }

  function drawBin(b) {
    var y = GY - b.h;
    if (b.k === 0) {
      ctx.fillStyle = '#1fbf9a'; rr(b.x + 1, y + 6, b.w - 2, b.h - 9, 3); ctx.fill();
      ctx.fillStyle = '#128f73'; rr(b.x - 1, y, b.w + 2, 8, 3); ctx.fill();
      ctx.fillStyle = '#0b0620'; circle(b.x + 6, GY - 3, 3); ctx.fill(); circle(b.x + b.w - 6, GY - 3, 3); ctx.fill();
    } else if (b.k === 1) {
      for (var s = 0; s < 2; s++) {
        var yy = y + s * (b.h / 2);
        ctx.fillStyle = s ? '#ff9f43' : '#ffb866';
        rr(b.x, yy, b.w, b.h / 2 - 1, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(22,13,51,.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(b.x + 3, yy + 3); ctx.lineTo(b.x + b.w - 3, yy + b.h / 2 - 4);
        ctx.moveTo(b.x + b.w - 3, yy + 3); ctx.lineTo(b.x + 3, yy + b.h / 2 - 4); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#5b6cff'; rr(b.x, y, b.w, b.h, 5); ctx.fill();
      ctx.fillStyle = '#8f9bff';
      for (var q = 0; q < 4; q++) ctx.fillRect(b.x + 6 + q * 13, y + 5, 6, b.h - 10);
    }
  }

  function drawPress(pr) {
    var pb = pressBottom(pr), top = GY - pb - 28;
    ctx.fillStyle = '#3a2470';
    ctx.fillRect(pr.x + pr.w / 2 - 4, -400, 8, top + 400);
    ctx.fillStyle = pressWarn(pr) && Math.floor(elapsed * 12) % 2 ? '#fff4e6' : '#ff5a3c';
    rr(pr.x, top, pr.w, 28, 4); ctx.fill();
    ctx.fillStyle = '#160d33';
    for (var s = 0; s < 3; s++) {
      ctx.beginPath();
      ctx.moveTo(pr.x + 4 + s * 11, top + 22); ctx.lineTo(pr.x + 10 + s * 11, top + 22);
      ctx.lineTo(pr.x + 14 + s * 11, top + 6); ctx.lineTo(pr.x + 8 + s * 11, top + 6);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawRoller(ro) {
    var y = GY - ro.alt - ro.r;
    ctx.save(); ctx.translate(ro.x, y); ctx.rotate(ro.rot);
    ctx.fillStyle = '#2ecc71'; circle(0, 0, ro.r); ctx.fill();
    ctx.strokeStyle = '#178a47'; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-ro.r * 0.5, -ro.r * 0.8); ctx.quadraticCurveTo(-ro.r * 0.9, 0, -ro.r * 0.5, ro.r * 0.8);
    ctx.moveTo(0, -ro.r * 0.95); ctx.lineTo(0, ro.r * 0.95);
    ctx.moveTo(ro.r * 0.5, -ro.r * 0.8); ctx.quadraticCurveTo(ro.r * 0.9, 0, ro.r * 0.5, ro.r * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer() {
    if (p.invul > 0 && p.stun <= 0 && Math.floor(p.invul * 16) % 2) return;
    var px = p.x, py = GY - p.alt;
    var st = clamp(p.vy / 900, -0.25, 0.25);
    var bh = 26 * (1 + st), bwid = PW * (1 - st * 0.5);
    var a = (p.grounded && p.moving) ? Math.sin(p.walk) * 5 : (p.grounded ? 0 : 3);
    // legs
    ctx.strokeStyle = '#e0a800'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px - 5, py - 9); ctx.lineTo(px - 5 + a, py - 2);
    ctx.moveTo(px + 5, py - 9); ctx.lineTo(px + 5 - a, py - 2);
    ctx.stroke();
    ctx.fillStyle = '#fff4e6';
    rr(px - 9 + a, py - 4, 10, 4, 2); ctx.fill();
    rr(px + 1 - a, py - 4, 10, 4, 2); ctx.fill();
    // body
    var top = py - 8 - bh;
    ctx.fillStyle = '#ffd23f'; rr(px - bwid / 2, top, bwid, bh, 8); ctx.fill();
    // eyes
    var ey = top + 9;
    if (p.stun > 0) {
      ctx.strokeStyle = '#160d33'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px - 1, ey - 3); ctx.lineTo(px + 4, ey + 3); ctx.moveTo(px + 4, ey - 3); ctx.lineTo(px - 1, ey + 3);
      ctx.moveTo(px + 6, ey - 3); ctx.lineTo(px + 11, ey + 3); ctx.moveTo(px + 11, ey - 3); ctx.lineTo(px + 6, ey + 3);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#fff'; circle(px + 1.5, ey, 3.6); ctx.fill(); circle(px + 8, ey, 3.6); ctx.fill();
      ctx.fillStyle = '#160d33'; circle(px + 2.8, ey, 1.7); ctx.fill(); circle(px + 9.3, ey, 1.7); ctx.fill();
    }
  }

  function drawChaser() {
    var cx = c.x, cy = GY - R, i;
    ctx.fillStyle = '#8a5a2b'; circle(cx, cy, R); ctx.fill();
    for (i = 0; i < 18; i++) {
      var ang = hash(i) * 6.283 + c.rot, rad = R * (0.2 + hash(i + 50) * 0.68);
      ctx.fillStyle = i % 3 ? '#5e3b17' : '#7fae2e';
      circle(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, 2.5 + hash(i + 9) * 3); ctx.fill();
    }
    ctx.strokeStyle = '#4a2d10'; ctx.lineWidth = 3; circle(cx, cy, R - 1.5); ctx.stroke();
    // face, looks right, does not rotate
    ctx.fillStyle = '#fff'; circle(cx + 16, cy - 14, 9); ctx.fill(); circle(cx + 38, cy - 12, 8); ctx.fill();
    ctx.fillStyle = '#160d33'; circle(cx + 19, cy - 13, 4); ctx.fill(); circle(cx + 41, cy - 11, 3.6); ctx.fill();
    ctx.strokeStyle = '#2a0d0d'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - 28); ctx.lineTo(cx + 24, cy - 21);
    ctx.moveTo(cx + 30, cy - 20); ctx.lineTo(cx + 47, cy - 25);
    ctx.stroke();
    ctx.fillStyle = '#2a0d0d';
    ctx.beginPath(); ctx.ellipse(cx + 30, cy + 14, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    for (i = 0; i < 4; i++) ctx.fillRect(cx + 18 + i * 6.5, cy + 4.5, 5, 5);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#24124f'); g.addColorStop(0.45, '#6a2a7a');
    g.addColorStop(0.8, '#ff6b5e'); g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    var gap = p.x - c.x;
    var danger = clamp(1 - (gap - 120) / 180, 0, 1);
    var sx = 0, sy = 0;
    if (!reduceMotion && state === 'play' && danger > 0.35) {
      sx = (Math.random() - 0.5) * danger * 3 * S; sy = (Math.random() - 0.5) * danger * 3 * S;
    }
    ctx.setTransform(S, 0, 0, S, sx, sy);

    var camX = p.x - VW * 0.45;
    drawBackground(camX);

    ctx.translate(-camX, 0);
    var i;
    for (i = 0; i < presses.length; i++) drawPress(presses[i]);
    for (i = 0; i < bins.length; i++) drawBin(bins[i]);
    for (i = 0; i < rollers.length; i++) drawRoller(rollers[i]);
    drawPlayer();
    drawChaser();

    // danger glow on the left edge while the falafel is still off screen
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (state === 'play' && danger > 0) {
      var lg = ctx.createLinearGradient(0, 0, 70, 0);
      var pulse = 0.35 + 0.25 * Math.sin(elapsed * 10);
      lg.addColorStop(0, 'rgba(255,61,139,' + (danger * pulse).toFixed(3) + ')');
      lg.addColorStop(1, 'rgba(255,61,139,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, 70, VH);
    }
  }

  // ---------- input ----------
  function anyPress() {
    if (state === 'over' && performance.now() - overAt > 700) {
      reset(); state = 'play'; setMsg(null);
      elMeters.firstChild.nodeValue = '0';
    }
  }
  function goDown() {
    input.go = true;
    if (state === 'ready') { state = 'play'; setMsg(null); }
    anyPress();
  }
  function goUp() { input.go = false; }
  function jumpDown() {
    input.jumpBuf = 0.13;
    if (state === 'ready' && auto.go) { state = 'play'; setMsg(null); }
    anyPress();
  }

  function bind(el, down, up) {
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      el.classList.add('on'); down();
    });
    var end = function () { el.classList.remove('on'); if (up) up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }
  var noEl = { classList: { add: function () {}, remove: function () {} } };
  var elGo = document.getElementById('go'), elJump = document.getElementById('jump');
  if (elGo) bind(elGo, goDown, goUp); else elGo = noEl;
  if (elJump) bind(elJump, jumpDown, null); else elJump = noEl;

  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { elGo.classList.add('on'); goDown(); e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') { elJump.classList.add('on'); jumpDown(); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) {
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { elGo.classList.remove('on'); goUp(); }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') { elJump.classList.remove('on'); }
  });
  window.addEventListener('blur', function () { input.go = false; elGo.classList.remove('on'); elJump.classList.remove('on'); });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---------- API for the TV page ----------
  window.Game = {
    goDown: goDown, goUp: goUp, jumpDown: jumpDown,
    setAuto: function (go, jump) { auto.go = !!go; auto.jump = !!jump; }
  };

  // ---------- loop ----------
  var last = 0;
  function frame(t) {
    var dt = Math.min(0.033, (t - last) / 1000 || 0);
    last = t;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  elBest.textContent = 'best ' + best + ' m';
  reset();
  // a few obstacles ahead so the first frame already shows the world
  while (nextX < 900) spawn();
  resize();
  requestAnimationFrame(frame);
})();
