// v5.1 (10/16/26): every photo Mike uploads gets the original round Isola logo in the
// bottom-right corner (Mike: "just the original one" — no pill, no text, no extra color).
// Sized off the photo's short side, so stamping an already-stamped photo of the same size
// lands exactly on top of the old one (no doubled mark).

// v5.3 (11/2/26): the markup screen can swap the corner badge (Isola or Clear Path Construction).
export type Brand = "isola" | "cpc";
export const BRANDS: { v: Brand; n: string; src: string; fill: string }[] = [
  { v: "isola", n: "Isola", src: "/isola-badge.png", fill: "#000" },
  { v: "cpc", n: "Clear Path Construction", src: "/cpc-badge.png", fill: "#fff" },
];
const logoP: Partial<Record<Brand, Promise<HTMLImageElement | null>>> = {};
function logo(brand: Brand): Promise<HTMLImageElement | null> {
  if (!logoP[brand]) {
    const src = (BRANDS.find((b) => b.v === brand) ?? BRANDS[0]).src;
    logoP[brand] = new Promise((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = src;
    });
  }
  return logoP[brand]!;
}

/** Draw the original round Isola logo in the bottom-right corner of a w×h image (image pixel space). */
export async function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, brand: Brand = "isola") {
  const lg = await logo(brand);
  if (!lg) return;
  const short = Math.min(w, h);
  const D = Math.round(Math.max(40, Math.min(220, short * 0.14)));
  const m = Math.round(short * 0.025);
  const x = w - m - D, y = h - m - D;
  ctx.save();
  // soft shadow so it lifts off busy photos
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = D * 0.12; ctx.shadowOffsetY = D * 0.02;
  ctx.beginPath(); ctx.arc(x + D / 2, y + D / 2, D / 2, 0, Math.PI * 2); ctx.fillStyle = (BRANDS.find((b) => b.v === brand) ?? BRANDS[0]).fill; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath(); ctx.arc(x + D / 2, y + D / 2, D / 2, 0, Math.PI * 2); ctx.clip();
  // v5.2 (10/31/26): logo.png is now a 1024px clean master; downscale it smoothly so the
  // badge edges and lettering stay sharp instead of the old gritty 256px palette PNG.
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(lg, x, y, D, D);
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
