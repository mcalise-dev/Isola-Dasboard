import { showError } from "@/components/Toaster";

// Shrink a phone photo to a JPEG data URI so it can live in a text column.
// EXIF orientation is honored by createImageBitmap in modern browsers.
export async function compressImage(file: File, maxEdge = 1100, quality = 0.7): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return canvas.toDataURL("image/jpeg", quality);
}

export function openImage(src: string) {
  const w = window.open();
  if (!w) { showError("Allow pop-ups to view the photo."); return; }
  w.document.write(`<body style="margin:0;background:#000"><img src="${src}" style="max-width:100%;display:block;margin:auto"></body>`);
}
