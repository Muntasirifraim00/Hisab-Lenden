/**
 * ছবি ছোট করা — ফোনের ১২ MP ছবি সরাসরি পাঠালে আপলোড ও AI স্ক্যান দুটোই ধীর হয়।
 */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<{ file: File; dataUrl: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("শুধু ছবি ফাইল দেওয়া যাবে।");
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ছবি প্রক্রিয়া করা গেল না।");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) throw new Error("ছবি প্রক্রিয়া করা গেল না।");

  const shrunk = new File([blob], `memo-${Date.now()}.jpg`, { type: "image/jpeg" });
  return { file: shrunk, dataUrl };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* কিছু ব্রাউজারে HEIC-এ ব্যর্থ হয় — নিচের পথে যাবে */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ছবিটা খোলা গেল না।"));
    };
    img.src = url;
  });
}
