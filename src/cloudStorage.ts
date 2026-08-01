import { supabase } from "./supabase";
import { Product } from "./types";

type ProductRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  image_url: string | null;
  category: Product["category"] | null;
  barcode: string;
  expires_at: string;
  quantity: number;
  created_at: string;
};

function fromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url || undefined,
    category: row.category || "Mercearia",
    barcode: row.barcode,
    expiresAt: row.expires_at,
    quantity: row.quantity,
    createdAt: row.created_at,
    notificationIds: [],
  };
}

function toRow(userId: string, organizationId: string | null, product: Product): ProductRow {
  return {
    id: product.id,
    user_id: userId,
    organization_id: organizationId,
    name: product.name,
    image_url: product.imageUrl || null,
    category: product.category || "Mercearia",
    barcode: product.barcode,
    expires_at: product.expiresAt,
    quantity: product.quantity,
    created_at: product.createdAt,
  };
}

export async function loadCloudProducts(organizationId: string | null, userId: string): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .order("expires_at", { ascending: true });
  query = organizationId
    ? query.eq("organization_id", organizationId)
    : query.eq("user_id", userId).is("organization_id", null);
  const { data, error } = await query;

  if (error) throw error;
  return (data as ProductRow[]).map(fromRow);
}

export async function replaceCloudProducts(
  userId: string,
  organizationId: string | null,
  products: Product[],
): Promise<void> {
  let deleteQuery = supabase
    .from("products")
    .delete()
    .eq("user_id", userId);
  deleteQuery = organizationId
    ? deleteQuery.eq("organization_id", organizationId)
    : deleteQuery.is("organization_id", null);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (!products.length) return;
  const { error: insertError } = await supabase.from("products").insert(
    products.map((product) => toRow(userId, organizationId, product)),
  );
  if (insertError) throw insertError;
}
