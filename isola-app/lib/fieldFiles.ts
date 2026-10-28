// v8.1 (10/28/26) file helpers for the job Field tab: phone photos and plan PDFs become
// JPEG data URLs (same format the rest of the app stores in *_b64 columns).

export async function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** Shrink a photo to `maxSide` px on its long edge, JPEG. */
export async function photoToJpeg(file: File | Blob, maxSide = 1600, quality = 0.75): Promise<{ dataUrl: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL("image/jpeg", quality), width: c.width, height: c.height };
}

/** Render every page of a PDF to a JPEG (long edge ~maxSide px). pdf.js loads on demand. */
export async function pdfToJpegs(file: File, maxSide = 2400, quality = 0.72): Promise<{ dataUrl: string; width: number; height: number }[]> {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: { dataUrl: string; width: number; height: number }[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(4, maxSide / Math.max(v1.width, v1.height));
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    out.push({ dataUrl: c.toDataURL("image/jpeg", quality), width: c.width, height: c.height });
  }
  return out;
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Save a Uint8Array / Blob as a download. */
export function saveFile(bytes: Uint8Array | Blob, name: string, type = "application/pdf") {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** "Courtyard at Metacom - Drainage" -> "Courtyard_at_Metacom_Drainage" (project file-name rule) */
export const fileSafe = (s: string) => s.replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_");
