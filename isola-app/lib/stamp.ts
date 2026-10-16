// v5.1 (10/16/26): every photo Mike uploads gets the Isola badge in the bottom-right corner —
// round logo + ISOLA on brand ink with a yellow rule (black / white / yellow).
// The badge is sized off the photo's short side, so stamping an already-stamped photo of the
// same size lands exactly on top of the old one (no doubled mark).

const INK = "rgba(11,13,14,0.88)";
const YEL = "#F2C230";

let logoP: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  if (!logoP) {
    logoP = new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = "/logo.png";
    });
  }
  return logoP;
}

/** Draw the badge onto a canvas context that covers a w×h image (image pixel space). */
export async function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const lg = await logo();
  const short = Math.min(w, h);
  const H = Math.round(Math.max(30, Math.min(150, short * 0.085)));
  const m = Math.round(short * 0.025);
  const fs = Math.round(H * 0.36);
  const track = fs * 0.2;
  const word = "ISOLA";
  ctx.save();
  ctx.font = `800 ${fs}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`;
  const glyphs = [...word].map((c) => ctx.measureText(c).width);
  const textW = glyphs.reduce((a, b) => a + b, 0) + track * (word.length - 1);
  const pad = H * 0.11, logoD = H - pad * 2, gap = H * 0.2, right = H * 0.36;
  const W = pad + logoD + gap + textW + right;
  const x = w - m - W, y = h - m - H, r = H / 2;

  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = H * 0.25; ctx.shadowOffsetY = H * 0.04;
  ctx.fillStyle = INK;
  ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(x, y, W, H, r); else ctx.rect(x, y, W, H);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = Math.max(1, H * 0.025); ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.stroke();

  // logo
  const lx = x + pad, ly = y + pad;
  if (lg) {
    ctx.save();
    ctx.beginPath(); ctx.arc(lx + logoD / 2, ly + logoD / 2, logoD / 2, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(lg, lx, ly, logoD, logoD);
    ctx.restore();
    ctx.beginPath(); ctx.arc(lx + logoD / 2, ly + logoD / 2, logoD / 2, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, H * 0.035); ctx.strokeStyle = YEL; ctx.stroke();
  }

  // ISOLA, letter-spaced, white
  let tx = lx + logoD + gap;
  const ty = y + H * 0.47;
  ctx.fillStyle = "#FFFFFF"; ctx.textBaseline = "middle";
  [...word].forEach((c, i) => { ctx.fillText(c, tx, ty); tx += glyphs[i] + track; });

  // yellow rule under the word
  ctx.fillStyle = YEL;
  const bh = Math.max(2, H * 0.065);
  ctx.fillRect(lx + logoD + gap, y + H * 0.7, textW, bh);
  ctx.restore();
}

/** Return a copy of a photo (data URL) with the Isola badge stamped on it, as JPEG. */
export async function stampPhoto(src: string, quality = 0.82): Promise<string> {
  const img: HTMLImageElement = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  await drawStamp(ctx, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/** Never let a stamp failure block an upload — fall back to the plain photo. */
export async function stampSafe(src: string, quality?: number): Promise<string> {
  try { return await stampPhoto(src, quality); } catch { return src; }
}
