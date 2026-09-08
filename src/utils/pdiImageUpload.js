// CRM/src/utils/pdiImageUpload.js

// Every image goes through crop + client-side compression before upload, so
// the *sent* payload stays small regardless of source size — this raw cap is
// just a backstop against absurd files before we even try to decode them.
export const MAX_RAW_IMAGE_BYTES = 20 * 1024 * 1024;
export const CROP_ASPECT = 4 / 3; // matches the printed photo box shape (see CRM_BACKEND's renderer.js photo section)
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.85;

export const fileToDataUri = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image'));
    img.src = src;
  });

// Crops to the selected pixel region, downsizes so the long edge is at most
// COMPRESS_MAX_DIM, and re-encodes as JPEG — keeps even a 15-20MB camera
// photo down to a few hundred KB regardless of the original format/size.
export async function cropAndCompress(imageSrc, cropPixels) {
  const img = await loadImage(imageSrc);
  const { x, y, width, height } = cropPixels;
  let outW = width;
  let outH = height;
  if (Math.max(outW, outH) > COMPRESS_MAX_DIM) {
    const scale = COMPRESS_MAX_DIM / Math.max(outW, outH);
    outW = Math.round(outW * scale);
    outH = Math.round(outH * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, x, y, width, height, 0, 0, outW, outH);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))), 'image/jpeg', COMPRESS_QUALITY);
  });
  return fileToDataUri(blob);
}
