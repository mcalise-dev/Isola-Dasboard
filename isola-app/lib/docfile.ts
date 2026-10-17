import { showError } from "@/components/Toaster";
import { compressImage } from "@/lib/image";

// v6.6: crew documents (W-9s). Photos are shrunk but kept sharp enough to read the numbers;
// PDFs go up as-is. Everything travels as a data: URL through the crew_doc_* RPCs.
export async function readDocFile(file: File): Promise<{ b64: string; mime: string; name: string }> {
  if (file.type.startsWith("image/")) {
    try { return { b64: await compressImage(file, 2000, 0.82), mime: "image/jpeg", name: file.name }; } catch { /* fall through to raw */ }
  }
  const b64: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return { b64, mime: file.type || "application/octet-stream", name: file.name };
}

// Open a stored document in a new tab. Blob URLs work for PDFs on iPhone where data: URLs don't.
// The tab is opened before the fetch so phones don't treat it as a blocked pop-up.
export async function openDoc(load: () => Promise<{ b64: string; mime: string } | null>) {
  const w = window.open("", "_blank");
  if (!w) { showError("Allow pop-ups to view the file."); return; }
  try {
    const d = await load();
    if (!d) { w.close(); showError("Couldn't open that file."); return; }
    const blob = await (await fetch(d.b64)).blob();
    w.location.href = URL.createObjectURL(new Blob([blob], { type: d.mime }));
  } catch (e: any) {
    w.close();
    showError("Couldn't open that file: " + (e?.message ?? "error"));
  }
}

export const docDate = (s: string) => new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
