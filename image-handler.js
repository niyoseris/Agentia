// Image download handler — fetches images and returns base64 data URLs
// for embedding directly in HTML reports (no download to disk)

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_PREFIXES = ['image/'];

export async function handleImageSave(url) {
  // Only http/https URLs
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('Geçersiz URL. Yalnızca http/https URL\'leri desteklenir.');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'image/*' }
  });

  if (!response.ok) {
    throw new Error(`Görsel indirilemedi (HTTP ${response.status}): ${url}`);
  }

  // Check Content-Type
  const contentType = response.headers.get('content-type') || '';
  const isValidImage = ALLOWED_MIME_PREFIXES.some(p => contentType.startsWith(p));
  if (!isValidImage) {
    throw new Error(`Geçersiz görsel türü: "${contentType}". URL bir görsel değil: ${url}`);
  }

  // Check Content-Length if available
  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_IMAGE_SIZE) {
    throw new Error(`Görsel çok büyük (${(contentLength / 1024 / 1024).toFixed(1)}MB). Maksimum: 5MB`);
  }

  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error(`Görsel çok büyük (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB). Maksimum: 5MB`);
  }

  const base64 = arrayBufferToBase64(arrayBuffer);
  const mime = contentType || 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  return {
    dataUrl,
    mime,
    size: arrayBuffer.byteLength,
    note: 'Use this dataUrl directly in <img src="..."> tags in your HTML.'
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Process in chunks to avoid call stack limits on large buffers
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
