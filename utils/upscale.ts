
// utils/upscale.ts
export type FitMode = "fit" | "fill" | "smart";
type Opts = {
  targetLongEdge: number; // 2048 hoặc 3840
  fit?: FitMode;
  bg?: "black" | "white" | "average";
};

function averageColor(img: HTMLImageElement | ImageBitmap): string {
  const cnv = document.createElement("canvas");
  const ctx = cnv.getContext("2d")!;
  cnv.width = Math.max(1, Math.min(64, (img as any).width || (img as any).bitmapWidth || 64));
  cnv.height = Math.max(1, Math.min(64, (img as any).height || (img as any).bitmapHeight || 64));
  ctx.drawImage(img as any, 0, 0, cnv.width, cnv.height);
  const d = ctx.getImageData(0, 0, cnv.width, cnv.height).data;
  let r=0,g=0,b=0;
  for (let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
  const n = d.length/4;
  return `rgb(${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)})`;
}

const clamp8 = (v:number)=> v<0?0:v>255?255:v;

function unsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount = 0.55,
  radius = 1.2,
  threshold = 2
) {
  // Gaussian blur bằng stack blur đơn giản để lấy bản mờ
  const cnvBlur = document.createElement("canvas");
  cnvBlur.width = w; cnvBlur.height = h;
  const ctxB = cnvBlur.getContext("2d")!;
  ctxB.drawImage(ctx.canvas, 0, 0);
  // blur nhẹ bằng filter CSS khi được hỗ trợ
  try {
    // @ts-ignore
    ctxB.filter = `blur(${radius}px)`;
    ctxB.drawImage(cnvBlur, 0, 0);
  } catch {}

  const src = ctx.getImageData(0,0,w,h);
  const blur = ctxB.getImageData(0,0,w,h);
  const d = src.data, b = blur.data;
  for (let i=0;i<d.length;i+=4){
    const dr = d[i]-b[i], dg = d[i+1]-b[i+1], db = d[i+2]-b[i+2];
    const mag = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
    if (mag > threshold){
      d[i]   = clamp8(d[i]   + dr*amount);
      d[i+1] = clamp8(d[i+1] + dg*amount);
      d[i+2] = clamp8(d[i+2] + db*amount);
    }
  }
  ctx.putImageData(src,0,0);
}


export async function upscaleToTarget(
  blob: Blob,
  { targetLongEdge, fit="fit", bg="black" }: Opts
): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(blob);
  const srcW = img.width, srcH = img.height;
  const srcAspect = srcW / srcH;

  // Tính kích thước mục tiêu theo cạnh dài
  let dstW: number, dstH: number;
  if (srcAspect >= 1) { // ngang
    dstW = targetLongEdge;
    dstH = Math.round(targetLongEdge / srcAspect);
  } else { // dọc
    dstH = targetLongEdge;
    dstW = Math.round(targetLongEdge * srcAspect);
  }

  // Canvas đích có thể khác nếu Fit với nền
  let outW = dstW, outH = dstH;
  let drawW = dstW, drawH = dstH;
  let sx = 0, sy = 0, sWidth = srcW, sHeight = srcH;
  let dx = 0, dy = 0;

  if (fit === "fill" || fit === "smart") {
    outW = targetLongEdge; 
    outH = targetLongEdge;
    const outAspect = 1.0;
    if (srcAspect > outAspect) {
        sHeight = srcH;
        sWidth = sHeight * outAspect;
        sx = (srcW - sWidth) / 2;
    } else {
        sWidth = srcW;
        sHeight = sWidth / outAspect;
        sy = (srcH - sHeight) / 2;
    }
    drawW = outW;
    drawH = outH;
  }

  const cnv = document.createElement("canvas");
  cnv.width = outW; cnv.height = outH;
  const ctx = cnv.getContext("2d", { alpha: false })!;
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = "high";

  // Nền
  let fillColor = bg === "white" ? "#fff" : bg === "black" ? "#000" : averageColor(img);
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, outW, outH);

  // Smart crop (rất nhẹ – center). Có thể nâng cấp bằng face-detect sau.
  ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, drawW, drawH);

  // Unsharp mask nhẹ
  unsharpMask(ctx, outW, outH, 0.55, 1.2, 2);
  
  img.close();

  return cnv;
}
