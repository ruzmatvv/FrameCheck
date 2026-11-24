;
;(() => {
  "use strict";
  const rates = [25, 30, 60];
  const loopSeconds = 12;
  const tau = 2 * Math.PI;
  const horizon = 162;
  let dialog, canvas, context, rate, phase, frame, previous, lastPaint;
  let playing = false;
  let opener;

  function path(points, fill) {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i][0], points[i][1]);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  }

  function gradient(y1, y2, stops) {
    const result = context.createLinearGradient(0, y1, 0, y2);
    stops.forEach(([position, color]) => result.addColorStop(position, color));
    return result;
  }

  function mountains(base, height, color, seed, shift) {
    const points = [[-20, 205]];
    for (let x = -20; x <= 1020; x += 6) {
      const v = x + shift;
      const ridge = Math.abs(Math.sin(v * 0.0046 + seed)) * 0.68 +
        Math.abs(Math.sin(v * 0.018 - seed)) * 0.19 + Math.abs(Math.sin(v * 0.051 + seed)) * 0.13;
      points.push([x, base - ridge * height]);
    }
    points.push([1020, 205]);
    path(points, color);
  }

  // A continuous center line and a single projection keep signs, curbs and lanes
  // aligned through the turn. The shape and the markings repeat every 12 seconds.
  function roadX(depth, angle) {
    const distance = 1 - depth;
    return 500 + distance * distance * (185 * Math.sin(angle) + 34 * Math.sin(2 * angle + distance * 2));
  }

  function slice(depth, lane, angle) {
    return [roadX(depth, angle) + lane * (9 + depth * 545), horizon + depth * (380 - horizon)];
  }

  function strip(near, far, left, right, color, angle) {
    path([slice(near, left, angle), slice(far, left, angle), slice(far, right, angle), slice(near, right, angle)], color);
  }

  function pine(x, y, size, dark) {
    path([[x, y - size], [x - size * .16, y - size * .48], [x - size * .10, y - size * .5],
      [x - size * .27, y - size * .12], [x - size * .18, y - size * .15],
      [x - size * .32, y], [x + size * .28, y], [x + size * .16, y - size * .23],
      [x + size * .24, y - size * .2], [x + size * .1, y - size * .51], [x + size * .15, y - size * .48]], dark);
  }

  function post(x, y, scale) {
    context.fillStyle = "#c4d1c6";
    context.fillRect(x, y - 29 * scale, 5 * scale, 29 * scale);
    context.fillStyle = "#f1ae72";
    context.fillRect(x, y - 25 * scale, 5 * scale, 7 * scale);
  }

  function car(angle) {
    const c = context;
    c.save();
    c.translate(500 + 12 * Math.sin(angle), 324);
    c.rotate(Math.sin(angle) * -.014);
    c.fillStyle = "#141c20";
    c.beginPath(); c.ellipse(0, 12, 90, 13, 0, 0, tau); c.fill();
    c.fillStyle = "#101819";
    c.fillRect(-74, -8, 18, 27);
    c.fillRect(56, -8, 18, 27);
    path([[-81,-4],[-75,-25],[-57,-32],[-41,-51],[-32,-56],[34,-56],[46,-51],[60,-32],[76,-25],[81,-4],[73,9],[53,13],[-55,13],[-73,9]],
      gradient(-56,13,[[0,"#e2f5ac"],[.35,"#b0d264"],[.54,"#809746"],[.57,"#a8bd67"],[.88,"#3d4b37"],[1,"#26332c"]]));
    path([[-48,-33],[-37,-49],[-29,-52],[30,-52],[39,-48],[48,-33],[34,-30],[-33,-30]],gradient(-52,-30,[[0,"#4b646b"],[.7,"#273d48"],[1,"#192a34"]]));
    path([[-80,-17],[-62,-15],[-44,-10],[43,-10],[64,-15],[80,-17],[75,-4],[50,2],[-50,2],[-75,-4]],"#28302e");
    path([[-78,-16],[-64,-15],[-44,-11],[-16,-10],[-16,-7],[-48,-8],[-76,-12]],"#ff6655");
    path([[78,-16],[64,-15],[44,-11],[16,-10],[16,-7],[48,-8],[76,-12]],"#ff6655");
    path([[-65,7],[-43,1],[43,1],[65,7],[47,11],[-47,11]],"#192324");
    c.fillStyle = "#d1d9c4"; c.fillRect(-11,-7,22,6);
    c.fillStyle = "#3b4841"; c.fillRect(-7,-5,14,2);
    path([[-66,-28],[-48,-30],[46,-30],[66,-28],[64,-25],[-65,-25]],"#39483e");
    c.restore();
  }

  function draw() {
    if (!context) return;
    const c = context;
    const width = canvas.width;
    const height = canvas.height;
    const angle = phase / loopSeconds * tau;
    // Crop the sides on a phone, retaining the road and car proportions.
    const scale = Math.max(width / 1000, height / 380);
    c.setTransform(scale, 0, 0, scale, (width - 1000 * scale) / 2, (height - 380 * scale) / 2);
    c.fillStyle = gradient(0,185,[[0,"#365878"],[.54,"#a0b9bf"],[.88,"#f0cfaa"],[1,"#f5c99c"]]);
    c.fillRect(0,0,1000,204);
    const sunX = 690 + Math.sin(angle) * 14;
    const glow = c.createRadialGradient(sunX,88,2,sunX,88,72);
    glow.addColorStop(0,"rgba(255,229,174,.8)"); glow.addColorStop(1,"rgba(255,224,163,0)");
    c.fillStyle = glow; c.fillRect(sunX-73,15,146,146);
    c.fillStyle = "#ffe7b5"; c.beginPath(); c.arc(sunX,88,14,0,tau); c.fill();
    const sway = Math.sin(angle) * 24;
    mountains(169,80,"#82979f",1,sway*.25);
    mountains(186,74,"#607c87",2.4,sway*.53);
    mountains(190,60,"#435f69",4.6,sway);
    c.fillStyle = gradient(horizon,380,[[0,"#647b70"],[.55,"#536858"],[1,"#334e42"]]);
    c.fillRect(0,horizon,1000,380-horizon);

    // Each segment travels toward the viewer; fractional travel wraps without a seam.
    const travel = phase / loopSeconds * 48;
    const offset = travel % 1;
    const group = Math.floor(travel);
    const asphalt = gradient(horizon,380,[[0,"#899191"],[.18,"#6c777c"],[.61,"#49585e"],[1,"#38464c"]]);
    for (let i=58; i>=0; i--) {
      const far = 1 / (1 + (i+1-offset)*.22);
      const near = 1 / (1 + (i-offset)*.22);
      const id = ((i+group)%48+48)%48;
      strip(near,far,-1.18,1.18,id%2?"#869083":"#7b897b",angle);
      strip(near,far,-1.04,1.04,id%2?"#d0cdc1":"#b16952",angle);
      strip(near,far,-1,1,asphalt,angle);
      strip(near,far,-.955,-.94,"#c9d0c9",angle); strip(near,far,.94,.955,"#c9d0c9",angle);
      if (id%4<2) {
        strip(near,far,-.32,-.303,"#c0c7c2",angle); strip(near,far,.303,.32,"#c0c7c2",angle);
      }
      if (id%2===0) {
        const left = slice(far, -1.18 - .18*(id%5),angle);
        const right = slice(far, 1.25 + .09*(id%7),angle);
        pine(left[0],left[1],far*(90+id%6*7),"#324e48");
        pine(right[0],right[1],far*(77+id%8*5),"#39564f");
      }
      if (id%3===0) {
        const left = slice(far,-1.093,angle); post(left[0],left[1],far);
        const right = slice(far,1.09,angle); post(right[0],right[1],far);
      }
    }
    car(angle);
  }

  function sizeCanvas() {
    if (!dialog.open || !context) return;
    const r = canvas.getBoundingClientRect();
    const density = Math.min(window.devicePixelRatio || 1, 1.6);
    const w = Math.max(1, Math.round(r.width * density));
    const h = Math.max(1, Math.round(r.height * density));
    if (w !== canvas.width || h !== canvas.height) {canvas.width = w; canvas.height = h;}
    draw();
  }

  function animate(now) {
    if (!playing || !dialog.open || document.hidden) return;
    if (previous !== undefined) phase = (phase + Math.min(now - previous, 250) / 1000) % loopSeconds;
    previous = now;
    const interval = 1000 / rate;
    if (lastPaint === undefined || now + .25 >= lastPaint + interval) {
      lastPaint = lastPaint === undefined ? now : lastPaint + Math.max(1, Math.floor((now-lastPaint+.25)/interval))*interval;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }

  function syncLoop() {
    cancelAnimationFrame(frame);
    previous = undefined;
    lastPaint = undefined;
    if (playing && dialog.open && !document.hidden) frame = requestAnimationFrame(animate);
    dialog.querySelector("[data-fps-play]").textContent = playing ? tr("Pauza") : tr("Davom ettirish");
  }

  function setRate(value) {
    rate = rates.reduce((a,b) => Math.abs(a-value) <= Math.abs(b-value) ? a : b);
    dialog.querySelectorAll("[data-fps-rate]").forEach(button => button.setAttribute("aria-pressed",String(Number(button.dataset.fpsRate)===rate)));
    dialog.querySelector("[data-fps-display]").textContent = rate + " FPS";
    lastPaint = undefined;
  }

  function init() {
    dialog = document.createElement("dialog");
    dialog.className = "fc-fps";
    dialog.setAttribute("aria-labelledby","fc-fps-title");
    dialog.innerHTML = `<div class="fc-fps-head"><div><small>FRAMECHECK / FPS SINOVI</small><h2 id="fc-fps-title">FPS’ni his qilib ko‘r</h2></div><button type="button" data-fps-close aria-label="Yopish">×</button></div>
      <div class="fc-fps-stage"><canvas role="img" aria-label="Tog‘ trassasida ketayotgan sport avtomobili"></canvas><span data-fps-display></span></div>
      <div class="fc-fps-panel"><div class="fc-fps-controls"><div class="fc-fps-rates" role="group" aria-label="Namoyish FPS’i">${rates.map(n=>`<button type="button" data-fps-rate="${n}" aria-pressed="false">${n} FPS</button>`).join("")}</div><div class="fc-fps-actions"><button type="button" data-fps-play>Pauza</button><button type="button" data-fps-replay>Boshidan</button></div></div>
      <p data-fps-note>Bir xil burilishni turli FPS’da solishtir. Ko‘rinadigan ravonlik ekraningning yangilanish chastotasiga ham bog‘liq.</p></div>`;
    bindStaticLanguage(dialog);
    document.body.append(dialog);
    canvas = dialog.querySelector("canvas");
    context = canvas.getContext("2d",{alpha:false});
    dialog.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) {
        if (event.target === dialog) {
          const rect = dialog.getBoundingClientRect();
          if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();
        }
        return;
      }
      if (button.hasAttribute("data-fps-close")) dialog.close();
      if (button.hasAttribute("data-fps-rate")) setRate(Number(button.dataset.fpsRate));
      if (button.hasAttribute("data-fps-play")) {playing = !playing; syncLoop();}
      if (button.hasAttribute("data-fps-replay")) {phase = 0; draw(); playing = true; syncLoop();}
    });
    dialog.addEventListener("close", () => {playing = false; syncLoop(); if (opener?.isConnected) opener.focus({preventScroll:true});});
    document.addEventListener("visibilitychange", syncLoop);
    if (window.ResizeObserver) new ResizeObserver(sizeCanvas).observe(canvas);
    else window.addEventListener("resize", sizeCanvas);
    if (!context) {
      dialog.querySelector("[data-fps-note]").textContent = tr("Bu brauzer 2D namoyishni ocholmadi. Zamonaviy brauzerda qayta oching.");
      dialog.querySelector(".fc-fps-controls").hidden = true;
    }
  }

  window.FramecheckFPS = {
    open(fps = 30) {
      if (!dialog) init();
      if (!dialog.open) {opener = document.activeElement; dialog.showModal();}
      const value = Number(fps);
      setRate(Number.isFinite(value) ? value : 30);
      phase = 0;
      playing = !!context && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sizeCanvas();
      syncLoop();
      dialog.querySelector('[data-fps-rate][aria-pressed="true"]').focus({preventScroll:true});
    }
  };
})();

