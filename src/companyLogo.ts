import { supabase } from "./supabase";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

function imageContentType(uri: string, responseType: string | null): string {
  if (uri.startsWith("data:")) return uri.slice(5, uri.indexOf(";")) || "image/jpeg";
  return responseType || "image/jpeg";
}

function imageExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

// Converte um data URI (data:image/...;base64,....) direto para ArrayBuffer
// sem usar fetch — o fetch de data URIs falha em alguns aparelhos Android.
function dataUriToArrayBuffer(uri: string): ArrayBuffer | null {
  const comma = uri.indexOf(",");
  if (comma < 0) return null;
  const base64 = uri.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function uploadCompanyLogo(userId: string, imageUri: string): Promise<string> {
  let imageBytes: ArrayBuffer;
  if (imageUri.startsWith("data:")) {
    const decoded = dataUriToArrayBuffer(imageUri);
    if (!decoded) throw new Error("Não foi possível ler a imagem selecionada.");
    imageBytes = decoded;
  } else {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(imageUri);
        if (!response.ok) throw new Error("Erro ao ler a imagem.");
        imageBytes = await response.arrayBuffer();
        break;
      } catch (err) {
        if (attempt === 3) throw new Error(`Nao foi possivel ler a imagem (${attempt} tentativas).`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  const contentType = imageContentType(imageUri, null);
  const extension = imageExtension(contentType);
  const filePath = `${userId}/company-logo.${extension}`;

  let uploadError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await supabase.storage
      .from("company-logos")
      .upload(filePath, imageBytes!, { contentType, upsert: true });
    if (!result.error) { uploadError = null; break; }
    uploadError = result.error;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  if (uploadError) throw new Error(`Falha ao enviar a logo (${(uploadError as Error).message || "tente novamente"}).`);

  const { data } = supabase.storage.from("company-logos").getPublicUrl(filePath);
  return `${data.publicUrl}?v=${Date.now()}`;
}
