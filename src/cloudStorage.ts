import { supabase } from "./supabase";
import { Product } from "./types";

type ProductRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  image_url: string | null;
  photo_original_url: string | null;
  photo_cutout_url: string | null;
  brand: string | null;
  description: string | null;
  packaging_type: string | null;
  category: Product["category"] | null;
  barcode: string;
  expires_at: string;
  quantity: number;
  notes: string | null;
  archived: boolean | null;
  archived_at: string | null;
  created_at: string;
};

function fromRow(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url || undefined,
    photoOriginalUrl: row.photo_original_url || undefined,
    photoCutoutUrl: row.photo_cutout_url || undefined,
    brand: row.brand || undefined,
    description: row.description || undefined,
    packagingType: row.packaging_type || undefined,
    category: row.category || "Mercearia",
    barcode: row.barcode,
    expiresAt: row.expires_at,
    quantity: row.quantity,
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || undefined,
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
    photo_original_url: product.photoOriginalUrl || null,
    photo_cutout_url: product.photoCutoutUrl || null,
    brand: product.brand || null,
    description: product.description || null,
    packaging_type: product.packagingType || null,
    category: product.category || "Mercearia",
    barcode: product.barcode,
    expires_at: product.expiresAt,
    quantity: product.quantity,
    notes: product.notes || null,
    archived: product.archived || false,
    archived_at: product.archivedAt || null,
    created_at: product.createdAt,
  };
}

export async function loadCloudProducts(organizationId: string | null, userId: string): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .or("archived.is.null,archived.eq.false")
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
  // Sincronização incremental: remove apenas os produtos que saíram da lista
  // e faz upsert dos demais. Evita apagar/reinserir tudo (e mantém a auditoria
  // registrando apenas mudanças reais).
  let listQuery = supabase
    .from("products")
    .select("id")
    .eq("user_id", userId);
  listQuery = organizationId
    ? listQuery.eq("organization_id", organizationId)
    : listQuery.is("organization_id", null);
  const { data: existingRows, error: listError } = await listQuery;
  if (listError) throw listError;

  const existingIds = new Set((existingRows ?? []).map((row) => (row as { id: string }).id));
  const nextIds = new Set(products.map((product) => product.id));
  const removedIds = [...existingIds].filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    let deleteQuery = supabase.from("products").delete().in("id", removedIds);
    deleteQuery = organizationId
      ? deleteQuery.eq("organization_id", organizationId)
      : deleteQuery.is("organization_id", null);
    const { error: deleteError } = await deleteQuery;
    if (deleteError) throw deleteError;
  }

  if (!products.length) return;
  const { error: upsertError } = await supabase
    .from("products")
    .upsert(products.map((product) => toRow(userId, organizationId, product)), {
      onConflict: "id",
    });
  if (upsertError) throw upsertError;
}

// Produtos arquivados (histórico): itens vencidos há mais de 4 dias.
export async function loadCloudArchivedProducts(
  organizationId: string | null,
  userId: string,
): Promise<Product[]> {
  let query = supabase
    .from("products")
    .select("*")
    .eq("archived", true)
    .order("archived_at", { ascending: false });
  query = organizationId
    ? query.eq("organization_id", organizationId)
    : query.eq("user_id", userId).is("organization_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data as ProductRow[]).map(fromRow);
}

// Exclusão definitiva do histórico (somente admin — RLS valida).
export async function deleteCloudProducts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("products").delete().in("id", ids);
  if (error) throw error;
}

// Atualiza apenas UM produto na nuvem (não substitui a lista inteira).
// Usado pelo processamento de fundo em segundo plano — evita apagar
// produtos adicionados/editados enquanto o processo roda.
export async function updateCloudProduct(
  userId: string,
  organizationId: string | null,
  product: Product,
): Promise<void> {
  const { error } = await supabase
    .from("products")
    .update(toRow(userId, organizationId, product))
    .eq("id", product.id)
    .eq("user_id", userId);
  if (error) throw error;
}