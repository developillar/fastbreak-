/* 2D face renderer — one vector portrait shared by the player builder
   preview and the cutscene dialogue portraits. Draws from a `look`
   ({skin, hair, hairColor, beard, band}) so what you build is exactly
   what talks back to you in MyCareer. Flat, bold, reads at 48px. */

import { SKIN_TONES, HAIR_COLORS, BANDS } from "./body.js";

const css = hex => "#" + hex.toString(16).padStart(6, "0");
const shade = (hex, f) => {
  const r = Math.round(((hex >> 16) & 255) * f), g = Math.round(((hex >> 8) & 255) * f),
        b = Math.round((hex & 255) * f);
  return `rgb(${r},${g},${b})`;
};

/* draw a portrait filling the canvas. opts: {jersey: "#hex" | null, bg: css | null} */
export function drawFace(canvas, look = {}, opts = {}) {
  const g = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height, u = W / 100; // 100-unit logical space
  g.clearRect(0, 0, W, H);
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, W, H); }
  g.save();
  g.scale(u, u);

  const skin = SKIN_TONES[(look.skin | 0) % SKIN_TONES.length] ?? SKIN_TONES[0];
  const hairC = HAIR_COLORS[(look.hairColor | 0) % HAIR_COLORS.length] ?? HAIR_COLORS[0];
  const hair = look.hair ?? 1, beard = look.beard ?? 0, band = look.band ?? 0;
  const S = css(skin), HC = css(hairC), DK = shade(skin, .82);

  // shoulders / jersey
  g.fillStyle = opts.jersey || "#22304e";
  g.beginPath(); g.ellipse(50, 102, 34, 22, 0, Math.PI, 0); g.fill();
  // neck
  g.fillStyle = DK;
  g.fillRect(43, 74, 14, 14);
  // ears
  g.fillStyle = S;
  g.beginPath(); g.ellipse(24.5, 52, 4.2, 6, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(75.5, 52, 4.2, 6, 0, 0, 7); g.fill();
  // head — tall ellipse, slightly narrower jaw
  g.beginPath();
  g.moveTo(27, 46);
  g.bezierCurveTo(27, 22, 73, 22, 73, 46);      // crown
  g.bezierCurveTo(73, 62, 66, 76, 50, 78);      // right jaw
  g.bezierCurveTo(34, 76, 27, 62, 27, 46);      // left jaw
  g.fill();

  // hair (behind band)
  g.fillStyle = HC;
  if (hair === 0){            // buzz — tight cap
    g.beginPath(); g.moveTo(27.5, 44);
    g.bezierCurveTo(27.5, 23, 72.5, 23, 72.5, 44);
    g.lineTo(69, 44); g.bezierCurveTo(69, 30, 31, 30, 31, 44);
    g.closePath(); g.fill();
  } else if (hair === 1){     // fade — full top, tapered sides
    g.beginPath(); g.moveTo(27, 46);
    g.bezierCurveTo(27, 20, 73, 20, 73, 46);
    g.lineTo(70, 46); g.bezierCurveTo(70, 33, 65, 29, 50, 29);
    g.bezierCurveTo(35, 29, 30, 33, 30, 46);
    g.closePath(); g.fill();
  } else if (hair === 2){     // afro
    g.beginPath(); g.ellipse(50, 27, 28, 19, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(30, 36, 9, 10, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(70, 36, 9, 10, 0, 0, 7); g.fill();
  } else if (hair === 3){     // twists — bumpy crown
    for (let i = 0; i < 6; i++){
      const x = 30 + i * 8, y = 27 + Math.abs(i - 2.5) * 2.2;
      g.beginPath(); g.ellipse(x, y, 5.4, 6.2, 0, 0, 7); g.fill();
    }
    g.beginPath(); g.moveTo(27.5, 44);
    g.bezierCurveTo(27.5, 26, 72.5, 26, 72.5, 44);
    g.lineTo(69, 44); g.bezierCurveTo(69, 31, 31, 31, 31, 44);
    g.closePath(); g.fill();
  }                            // 4 = bald: crown shine instead
  if (hair === 4){
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 2.4; g.lineCap = "round";
    g.beginPath(); g.arc(50, 40, 17, -2.5, -1.9); g.stroke();
  }

  // headband
  const bandDef = BANDS[band] || BANDS[0];
  if (bandDef.color){
    g.fillStyle = bandDef.color === "team" ? (opts.jersey || "#2f7bff") : css(bandDef.color);
    g.beginPath(); g.moveTo(27.2, 41);
    g.bezierCurveTo(34, 36.5, 66, 36.5, 72.8, 41);
    g.lineTo(72.6, 35.5); g.bezierCurveTo(66, 31, 34, 31, 27.4, 35.5);
    g.closePath(); g.fill();
  }

  // brows
  g.strokeStyle = shade(hairC, .9); g.lineWidth = 2.6; g.lineCap = "round";
  g.beginPath(); g.moveTo(33.5, 47); g.lineTo(43.5, 46); g.stroke();
  g.beginPath(); g.moveTo(56.5, 46); g.lineTo(66.5, 47); g.stroke();
  // eyes
  g.fillStyle = "#f4f2ee";
  g.beginPath(); g.ellipse(38.5, 52, 4.4, 3.1, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(61.5, 52, 4.4, 3.1, 0, 0, 7); g.fill();
  g.fillStyle = "#1c1712";
  g.beginPath(); g.arc(39.2, 52.3, 1.9, 0, 7); g.fill();
  g.beginPath(); g.arc(60.8, 52.3, 1.9, 0, 7); g.fill();
  // nose
  g.strokeStyle = DK; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(50, 54); g.lineTo(48.6, 61.5); g.lineTo(51.6, 62.5); g.stroke();
  // mouth
  g.strokeStyle = shade(skin, .6); g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(43.5, 68.5); g.quadraticCurveTo(50, 70.5, 56.5, 68.5); g.stroke();

  // facial hair (over mouth/jaw)
  g.fillStyle = HC;
  if (beard === 1){           // goatee
    g.beginPath(); g.ellipse(50, 73.5, 6.4, 4.6, 0, 0, 7); g.fill();
    g.fillRect(43.5, 64.6, 13, 2.4);                       // mustache
    g.fillStyle = S; g.beginPath(); g.ellipse(50, 69.3, 5, 2.2, 0, 0, 7); g.fill();
    g.strokeStyle = shade(skin, .6); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(44.5, 68.5); g.quadraticCurveTo(50, 70.2, 55.5, 68.5); g.stroke();
  } else if (beard === 2){    // full beard
    g.beginPath();
    g.moveTo(28.5, 52);
    g.bezierCurveTo(30, 68, 36, 79, 50, 80.5);
    g.bezierCurveTo(64, 79, 70, 68, 71.5, 52);
    g.lineTo(68, 52);
    g.bezierCurveTo(67, 63, 62, 70.5, 50, 71.5);
    g.bezierCurveTo(38, 70.5, 33, 63, 32, 52);
    g.closePath(); g.fill();
    g.fillRect(43.5, 64.4, 13, 2.6);                       // mustache
  } else if (beard === 3){    // chinstrap
    g.beginPath();
    g.moveTo(29, 55);
    g.bezierCurveTo(31, 68, 37, 77.5, 50, 79);
    g.bezierCurveTo(63, 77.5, 69, 68, 71, 55);
    g.lineTo(68.5, 55);
    g.bezierCurveTo(67, 66, 61, 73.5, 50, 74.8);
    g.bezierCurveTo(39, 73.5, 33, 66, 31.5, 55);
    g.closePath(); g.fill();
  }

  g.restore();
}
