import { supabase } from "./supabase";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function avatarContentType(uri: string, responseType: string | null): string {
  if (uri.startsWith("data:")) {
    return uri.slice(5, uri.indexOf(";")) || "image/jpeg";
  }
  return responseType?.startsWith("image/") ? responseType : "image/jpeg";
}

function avatarExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function uploadAvatar(userId: string, imageUri: string): Promise<string> {
  const response = await fetch(imageUri);
  if (!response.ok) throw new Error("Não foi possível ler a foto selecionada.");

  const contentType = avatarContentType(imageUri, response.headers.get("content-type"));
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  }
  const file = await response.arrayBuffer();
  if (file.byteLength > MAX_AVATAR_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }
  const extension = avatarExtension(contentType);
  const filePath = `${userId}/profile.${extension}`;

  const { error } = await supabase.storage
    .from("avatars")
    .upload(filePath, file, { contentType, upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });
  if (profileError) throw profileError;
  return publicUrl;
}
