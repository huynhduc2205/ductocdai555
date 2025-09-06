
// utils/download.ts
export async function downloadCanvas(
  canvas: HTMLCanvasElement,
  { format = "jpg", quality = 0.95, basename = "result" }:
  { format?: "png"|"jpg", quality?: number, basename?: string }
){
  const w = canvas.width, h = canvas.height;
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), mime, quality));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${basename}_${w}x${h}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 0);
}
