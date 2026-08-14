/** Upload e atualização do avatar do usuário no armazenamento privado. */
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

export async function uploadAvatar(userId: string, imageUri: string): Promise<string> {
  let file: ArrayBuffer;
  if (imageUri.startsWith("data:")) {
    const decoded = dataUriToArrayBuffer(imageUri);
    if (!decoded) throw new Error("Não foi possível ler a foto selecionada.");
    file = decoded;
  } else {
    const response = await fetch(imageUri);
    if (!response.ok) throw new Error("Não foi possível ler a foto selecionada.");
    file = await response.arrayBuffer();
  }

  const contentType = avatarContentType(imageUri, null);
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  }
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
