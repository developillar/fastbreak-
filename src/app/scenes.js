/* Cutscene backdrops — painted vector scenes on a canvas. Each kind is a
   flat, moody establishing shot; the player pans it slowly (CSS) for the
   cinematic feel. Logical space is 100 x 150 (portrait). */

const rngOf = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

export function drawSceneBg(canvas, kind = "blacktop") {
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const ux = W / 100, uy = H / 150;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.scale(ux, uy);
  const grad = (y0, y1, stops) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    return gr;
  };
  const rnd = rngOf(kind.length * 7919 + 17);

  if (kind === "blacktop") {
    // dawn sky over the neighborhood court
    g.fillStyle = grad(0, 95, [[0, "#1b1b33"], [.55, "#54325a"], [.85, "#c96b4a"], [1, "#e8975c"]]);
    g.fillRect(0, 0, 100, 95);
    g.fillStyle = "#f4c877";                                   // low sun
    g.beginPath(); g.arc(72, 78, 7, 0, 7); g.fill();
    g.fillStyle = "rgba(20,16,30,.92)";                        // skyline
    for (let x = -2; x < 102;) {
      const w = 7 + rnd() * 12, h = 12 + rnd() * 22;
      g.fillRect(x, 82 - h, w, h + 2); x += w + 1.5;
    }
    g.fillStyle = grad(84, 150, [[0, "#3a3d44"], [1, "#26282e"]]); // asphalt
    g.fillRect(0, 84, 100, 66);
    g.strokeStyle = "rgba(230,234,240,.5)"; g.lineWidth = .7;   // court paint
    g.beginPath(); g.ellipse(50, 132, 30, 12, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(8, 150); g.lineTo(26, 108); g.stroke();
    g.beginPath(); g.moveTo(92, 150); g.lineTo(74, 108); g.stroke();
    // hoop silhouette
    g.strokeStyle = "#101016"; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(50, 84); g.lineTo(50, 62); g.stroke();
    g.fillStyle = "#101016"; g.fillRect(43, 58, 14, 9);
    g.fillStyle = "#1c1c26"; g.fillRect(44.5, 59.5, 11, 6);
    g.strokeStyle = "#e8703c"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(46, 67); g.lineTo(54, 67); g.stroke();
    g.strokeStyle = "rgba(220,225,235,.55)"; g.lineWidth = .35; // net
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(46.8 + i * 1.8, 67); g.lineTo(48 + i * 1.4, 71); g.stroke();
    }
    // chain-link foreground hint
    g.strokeStyle = "rgba(160,170,185,.16)"; g.lineWidth = .5;
    for (let i = -30; i < 130; i += 7) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 44, 150); g.stroke();
      g.beginPath(); g.moveTo(i + 44, 0); g.lineTo(i, 150); g.stroke();
    }
  } else if (kind === "gym") {
    g.fillStyle = grad(0, 96, [[0, "#231c12"], [1, "#43331d"]]);  // wall
    g.fillRect(0, 0, 100, 96);
    g.fillStyle = grad(96, 150, [[0, "#8a6a3e"], [1, "#5d4526"]]); // floor
    g.fillRect(0, 96, 100, 54);
    g.strokeStyle = "rgba(240,240,240,.25)"; g.lineWidth = .8;
    g.beginPath(); g.moveTo(0, 118); g.lineTo(100, 112); g.stroke();
    // window light shafts
    for (const wx of [16, 44, 72]) {
      g.fillStyle = "rgba(255,240,200,.14)";
      g.beginPath();
      g.moveTo(wx, 8); g.lineTo(wx + 12, 8); g.lineTo(wx + 30, 96); g.lineTo(wx + 6, 96);
      g.closePath(); g.fill();
      g.fillStyle = "rgba(255,246,215,.75)";
      g.fillRect(wx, 6, 12, 16);
      g.strokeStyle = "rgba(40,30,16,.8)"; g.lineWidth = .8;
      g.strokeRect(wx, 6, 12, 16);
      g.beginPath(); g.moveTo(wx + 6, 6); g.lineTo(wx + 6, 22); g.stroke();
    }
    // banners
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ["#8a3b3b", "#2b4a8c", "#8a6a1e", "#3b6a3b"][i];
      g.beginPath();
      g.moveTo(10 + i * 22, 30); g.lineTo(24 + i * 22, 30);
      g.lineTo(24 + i * 22, 52); g.lineTo(17 + i * 22, 46); g.lineTo(10 + i * 22, 52);
      g.closePath(); g.fill();
    }
    // ball rack silhouette
    g.fillStyle = "rgba(20,14,8,.85)";
    g.fillRect(70, 84, 22, 12);
    g.fillStyle = "#b55c26";
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(74 + i * 5, 84, 2.2, 0, 7); g.fill(); }
  } else if (kind === "stage") {
    g.fillStyle = grad(0, 150, [[0, "#06060c"], [.6, "#101226"], [1, "#1a1c33"]]);
    g.fillRect(0, 0, 100, 150);
    // big screen glow
    g.fillStyle = "rgba(47,123,255,.3)";
    g.fillRect(18, 14, 64, 34);
    g.fillStyle = "rgba(120,180,255,.5)";
    g.fillRect(20, 16, 60, 30);
    g.fillStyle = "rgba(10,14,30,.85)";
    g.font = "900 italic 7px sans-serif"; g.textAlign = "center";
    g.fillText("THE DRAFT", 50, 34);
    // spotlight cone on the podium
    g.fillStyle = "rgba(255,244,214,.13)";
    g.beginPath(); g.moveTo(50, 0); g.lineTo(20, 118); g.lineTo(80, 118); g.closePath(); g.fill();
    g.fillStyle = "#141826";                                    // podium
    g.fillRect(38, 88, 24, 30);
    g.fillStyle = "#0c101c";
    g.fillRect(35, 84, 30, 6);
    // confetti
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ["#ffb545", "#39d4ff", "#ff6a5e", "#54e08a", "#b79aff"][i % 5];
      g.globalAlpha = .5 + rnd() * .5;
      g.fillRect(rnd() * 100, rnd() * 130, 1.1, 2);
    }
    g.globalAlpha = 1;
  } else if (kind === "locker") {
    g.fillStyle = grad(0, 150, [[0, "#12151f"], [1, "#1d222f"]]);
    g.fillRect(0, 0, 100, 150);
    g.fillStyle = grad(100, 150, [[0, "#262b38"], [1, "#161a24"]]); // bench/floor
    g.fillRect(0, 100, 100, 50);
    // stalls
    for (let i = 0; i < 4; i++) {
      const x = 4 + i * 24;
      g.fillStyle = "#1a1f2c"; g.fillRect(x, 18, 21, 84);
      g.strokeStyle = "rgba(120,150,200,.2)"; g.lineWidth = .7; g.strokeRect(x, 18, 21, 84);
      g.fillStyle = "#0e1119"; g.fillRect(x + 2, 22, 17, 10);   // nameplate
      // hanging jersey in one stall
      if (i === 2) {
        g.fillStyle = "#2f6fe0";
        g.beginPath();
        g.moveTo(x + 5, 40); g.lineTo(x + 16, 40); g.lineTo(x + 18, 48);
        g.lineTo(x + 15, 48); g.lineTo(x + 15, 72); g.lineTo(x + 6, 72);
        g.lineTo(x + 6, 48); g.lineTo(x + 3, 48);
        g.closePath(); g.fill();
        g.fillStyle = "rgba(255,255,255,.85)";
        g.font = "900 6px sans-serif"; g.textAlign = "center";
        g.fillText("14", x + 10.5, 60);
      }
      g.fillStyle = "#232a3a"; g.fillRect(x + 1, 96, 19, 5);    // bench seat
    }
    // overhead strip light
    g.fillStyle = "rgba(255,250,230,.1)";
    g.fillRect(0, 8, 100, 5);
    g.fillStyle = "rgba(255,250,230,.7)";
    g.fillRect(14, 9, 72, 2);
  } else if (kind === "press") {
    g.fillStyle = grad(0, 150, [[0, "#0c0e18"], [1, "#181c2c"]]);
    g.fillRect(0, 0, 100, 150);
    // step-and-repeat backdrop
    g.fillStyle = "#141a2c"; g.fillRect(6, 12, 88, 92);
    g.font = "900 italic 4.6px sans-serif"; g.textAlign = "center";
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      g.fillStyle = (r + c) % 2 ? "rgba(120,160,255,.3)" : "rgba(255,181,69,.28)";
      g.fillText((r + c) % 2 ? "FASTBREAK" : "FB5", 18 + c * 22 + (r % 2) * 10, 22 + r * 11);
    }
    // table + mics
    g.fillStyle = "#0a0d16"; g.fillRect(0, 104, 100, 16);
    g.fillStyle = "#232a3c"; g.fillRect(0, 102, 100, 3);
    for (const mx of [38, 50, 62]) {
      g.strokeStyle = "#0c0f18"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(mx, 102); g.lineTo(mx + (mx < 50 ? 3 : mx > 50 ? -3 : 0), 92); g.stroke();
      g.fillStyle = "#05070c";
      g.beginPath(); g.arc(mx + (mx < 50 ? 3 : mx > 50 ? -3 : 0), 90.5, 2.1, 0, 7); g.fill();
    }
    // camera flashes
    for (let i = 0; i < 7; i++) {
      g.fillStyle = "rgba(255,255,255," + (0.05 + rnd() * .12) + ")";
      g.beginPath(); g.arc(rnd() * 100, 118 + rnd() * 28, 3 + rnd() * 5, 0, 7); g.fill();
    }
  } else if (kind === "arena") {
    g.fillStyle = grad(0, 150, [[0, "#05060c"], [1, "#0e1220"]]);
    g.fillRect(0, 0, 100, 150);
    // bowl of crowd dots
    for (let row = 0; row < 12; row++) {
      const y = 18 + row * 5.4, inset = Math.max(0, 26 - row * 2.4);
      for (let x = inset; x < 100 - inset; x += 2.1) {
        g.fillStyle = `rgba(${140 + (rnd() * 80) | 0},${130 + (rnd() * 70) | 0},${150 + (rnd() * 70) | 0},${.25 + rnd() * .4})`;
        g.fillRect(x, y, 1.15, 1.6);
      }
    }
    // court glow at the bottom
    g.fillStyle = grad(96, 150, [[0, "#b98a4e"], [.7, "#8a6538"], [1, "#6b4d28"]]);
    g.fillRect(0, 96, 100, 54);
    g.fillStyle = "rgba(255,240,210,.2)";
    g.beginPath(); g.ellipse(50, 96, 58, 12, 0, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = .8;
    g.beginPath(); g.ellipse(50, 124, 16, 7, 0, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(0, 124); g.lineTo(34, 124); g.stroke();
    g.beginPath(); g.moveTo(66, 124); g.lineTo(100, 124); g.stroke();
    // spotlights
    for (const sx of [22, 78]) {
      g.fillStyle = "rgba(255,244,214,.08)";
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx - 16, 96); g.lineTo(sx + 16, 96); g.closePath(); g.fill();
    }
  } else { // rooftop / night
    g.fillStyle = grad(0, 150, [[0, "#070811"], [.6, "#10142a"], [1, "#1a1f38"]]);
    g.fillRect(0, 0, 100, 150);
    g.fillStyle = "#e8e4d8";                                    // moon
    g.beginPath(); g.arc(76, 22, 6, 0, 7); g.fill();
    g.fillStyle = "rgba(232,228,216,.14)";
    g.beginPath(); g.arc(76, 22, 10, 0, 7); g.fill();
    for (let i = 0; i < 40; i++) {                              // stars
      g.fillStyle = "rgba(255,255,255," + (.2 + rnd() * .6) + ")";
      g.fillRect(rnd() * 100, rnd() * 60, .6, .6);
    }
    // city towers with lit windows
    for (let x = -2; x < 102;) {
      const w = 9 + rnd() * 13, h = 34 + rnd() * 48, bx = x;
      g.fillStyle = "#0b0d17";
      g.fillRect(bx, 128 - h, w, h + 22);
      for (let wy = 132 - h; wy < 122; wy += 5) for (let wx = bx + 2; wx < bx + w - 2.4; wx += 3.4) {
        if (rnd() < .32) { g.fillStyle = "rgba(255,214,140,.75)"; g.fillRect(wx, wy, 1.7, 2.4); }
      }
      x += w + 2;
    }
    // rooftop ledge
    g.fillStyle = "#141824"; g.fillRect(0, 128, 100, 22);
    g.fillStyle = "#0d1019"; g.fillRect(0, 126, 100, 3);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
