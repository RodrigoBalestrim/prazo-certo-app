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
  const response = await fetch(imageUri);
  if (!response.ok) throw new Error("Nao foi possivel ler a imagem selecionada.");

  const contentType = imageContentType(imageUri, response.headers.get("content-type"));
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  }

  const file = await response.arrayBuffer();
  if (file.byteLength > MAX_IMAGE_SIZE) {
    throw new Error("A imagem deve ter no maximo 2 MB.");
  }

  const extension = imageExtension(contentType);
  const filePath = `${userId}/company-logo.${extension}`;
  const { error } = await supabase.storage
    .from("company-logos")
    .upload(filePath, file, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("company-logos").getPublicUrl(filePath);
  return `${data.publicUrl}?v=${Date.now()}`;
}
