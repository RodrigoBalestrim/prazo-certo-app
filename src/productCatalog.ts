import { supabase } from "./supabase";
import { ProductCategory } from "./types";

export type CatalogProduct = {
  name: string;
  imageUrl: string | null;
  category: ProductCategory | null;
};

type CatalogRow = {
  name: string;
  image_url: string | null;
  category: ProductCategory | null;
};

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function imageContentType(uri: string, responseType: string | null): string {
  if (uri.startsWith("data:")) {
    return uri.slice(5, uri.indexOf(";")) || "image/jpeg";
  }
  return responseType?.startsWith("image/") ? responseType : "image/jpeg";
}

function imageExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function isLocalImage(uri: string): boolean {
  return /^(data:|file:|blob:)/.test(uri);
}

async function uploadProductImage(userId: string, barcode: string, uri: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Não foi possível ler a foto do produto.");
  const contentType = imageContentType(uri, response.headers.get("content-type"));
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use uma imagem JPG, PNG ou WEBP.");
  }
  const file = await response.arrayBuffer();
  if (file.byteLength > MAX_IMAGE_SIZE) {
    throw new Error("A imagem deve ter no máximo 5 MB.");
  }
  const extension = imageExtension(contentType);
  const safeBarcode = barcode.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${userId}/${safeBarcode}.${extension}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function lookupCatalogProduct(barcode: string): Promise<CatalogProduct | null> {
  const normalized = barcode.trim();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("product_catalog")
    .select("name,image_url,category")
    .eq("barcode", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as CatalogRow;
  return {
    name: row.name,
    imageUrl: row.image_url,
    category: row.category,
  };
}

export async function contributeCatalogProduct(
  userId: string,
  barcode: string,
  name: string,
  imageUrl: string | undefined,
  category: ProductCategory,
): Promise<string | undefined> {
  const normalized = barcode.trim();
  if (!normalized) return imageUrl;

  const existing = await lookupCatalogProduct(normalized);
  if (existing) {
    if (imageUrl && isLocalImage(imageUrl)) {
      const uploadedImageUrl = await uploadProductImage(userId, normalized, imageUrl);
      if (!existing.imageUrl) {
        await supabase
          .from("product_catalog")
          .update({ image_url: uploadedImageUrl })
          .eq("barcode", normalized)
          .is("image_url", null);
      }
      return uploadedImageUrl;
    }
    return imageUrl || existing.imageUrl || undefined;
  }

  let permanentImageUrl = imageUrl;
  if (permanentImageUrl && isLocalImage(permanentImageUrl)) {
    permanentImageUrl = await uploadProductImage(userId, normalized, permanentImageUrl);
  }

  const { error } = await supabase.from("product_catalog").insert({
    barcode: normalized,
    name: name.trim(),
    image_url: permanentImageUrl || null,
    category,
    created_by: userId,
  });
  if (error && error.code !== "23505") throw error;
  return permanentImageUrl;
}
