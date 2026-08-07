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

export async function uploadCompanyLogo(userId: string, imageUri: string): Promise<string> {
  let imageBytes: ArrayBuffer;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(imageUri);
      if (!response.ok) throw new Error("Erro ao ler a imagem.");

      const contentType = imageContentType(imageUri, response.headers.get("content-type"));
      if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
        throw new Error("Use uma imagem JPG, PNG ou WEBP.");
      }

      imageBytes = await response.arrayBuffer();
      if (imageBytes.byteLength > MAX_IMAGE_SIZE) {
        throw new Error("A imagem deve ter no maximo 2 MB.");
      }
      break;
    } catch (err) {
      if (attempt === 3) throw new Error(`Nao foi possivel ler a imagem (${attempt} tentativas).`);
      await new Promise((r) => setTimeout(r, 2000));
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
