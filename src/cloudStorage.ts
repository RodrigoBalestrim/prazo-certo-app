/**
 * Camada de persistência em nuvem (Supabase) dos produtos.
 *
 * Regras que o resto do app depende de manter:
 * - A LISTA é fonte de verdade em cada aparelho (AsyncStorage). Este módulo
 *   apenas espelha ela na nuvem; nunca apaga por diferença contra a lista.
 * - Toda operação filtra por user_id/group (ou delega à RLS) para nunca
 *   tocar em dados de outro usuário.
 * - Operações que podem conflitar com edição em segundo plano usam escrita
 *   por id (updateCloudProduct), nunca substituição da lista inteira.
 */
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
  preco_cents: number | null;
  expires_at: string;
  quantity: number;
  lot: string | null;
  notes: string | null;
  archived: boolean | null;
  archived_at: string | null;
  rebaixa_aprovada: boolean | null;
  rebaixa_data: string | null;
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
    lot: row.lot || undefined,
    notes: row.notes || undefined,
    archived: Boolean(row.archived),
    archivedAt: row.archived_at || undefined,
    rebaixaAprovada: Boolean(row.rebaixa_aprovada),
    rebaixaData: row.rebaixa_data || undefined,
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
    lot: product.lot || null,
    notes: product.notes || null,
    archived: product.archived || false,
    archived_at: product.archivedAt || null,
    rebaixa_aprovada: product.rebaixaAprovada || false,
    rebaixa_data: product.rebaixaData || null,
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
  removedIds: string[] = [],
): Promise<void> {
  // Upsert apenas dos produtos recebidos. Exclusão acontece SOMENTE para os
  // ids explícitos em removedIds (removidos pelo usuário). Nunca apaga por
  // diferença contra a lista local: uma lista local defasada (outro aparelho,
  // cache vazio) apagaria produtos válidos da nuvem.
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
export async function deleteCloudProducts(
  ids: string[],
  scope?: { userId?: string; organizationId?: string | null },
): Promise<void> {
  if (!ids.length) return;
  let query = supabase.from("products").delete().in("id", ids);
  if (scope?.organizationId != null) {
    query = query.eq("organization_id", scope.organizationId);
  } else if (scope?.userId) {
    query = query.eq("user_id", scope.userId).is("organization_id", null);
  }
  const { error } = await query;
  if (error) throw error;
}

/** Resultado agregado do dashboard de perda (valores em centavos). */
export type PerdaEstimada = {
  vencidosCentavos: number;
  vencendoCentavos: number;
  vencidosItens: number;
  vencendoItens: number;
};

/** Busca a perda estimada (vencidos + vencendo) para o escopo atual. */
export async function carregarPerdaEstimada(dias = 7): Promise<PerdaEstimada> {
  const { data, error } = await supabase.rpc("perda_estimada", { p_dias: dias });
  if (error) throw error;
  const row = (data ?? [])[0] ?? {};
  return {
    vencidosCentavos: Number(row.vencidos_centavos ?? 0),
    vencendoCentavos: Number(row.vencendo_centavos ?? 0),
    vencidosItens: Number(row.vencidos_itens ?? 0),
    vencendoItens: Number(row.vencendo_itens ?? 0),
  };
}

/**
 * Baixa de estoque (venda). Chama a RPC baixar_estoque, que respeita PEPS
 * (primeiro a vencer, primeiro a sair) e bloqueia lote vencido.
 * Retorna a quantidade efetivamente baixada.
 */
export async function baixarEstoque(productId: string, quantity: number): Promise<number> {
  const { data, error } = await supabase.rpc("baixar_estoque", {
    p_product_id: productId,
    p_quantity: quantity,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Reposição de estoque. Adiciona um NOVO lote (ou soma no existente de mesmo
 * recebimento+validade) e atualiza o saldo do produto.
 */
export async function reporEstoque(
  productId: string,
  quantity: number,
  expiresAt: string, // ISO "YYYY-MM-DD"
): Promise<number> {
  const { data, error } = await supabase.rpc("repor_estoque", {
    p_product_id: productId,
    p_quantity: quantity,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

// Atualiza apenas UM produto na nuvem (não substitui a lista inteira).
// Usado pelo processamento de fundo em segundo plano — evita apagar
// produtos adicionados/editados enquanto o processo roda.
export async function updateCloudProduct(
  userId: string,
  organizationId: string | null,
  product: Product,
): Promise<void> {
  // O dono do registro pode divergir do usuário atual em lista compartilhada
  // (o item foi criado por outro membro do grupo), então não fixamos o
  // user_id no corpo — a RLS valida a permissão de escrita no banco.
  const row = toRow(userId, organizationId, product);
  if (organizationId) {
    delete (row as { user_id?: string }).user_id;
  }
  let query = supabase.from("products").update(row).eq("id", product.id);
  query = organizationId
    ? query.eq("organization_id", organizationId)
    : query.eq("user_id", userId).is("organization_id", null);
  const { error } = await query;
  if (error) throw error;
}

// Fotos base64 gravadas no banco (produtos sem codigo de barras ou com
// recorte) sao migradas para o Storage. Reduz o payload do login.
export async function migrateBase64Images(
  userId: string,
  products: Product[],
): Promise<Product[]> {
  const migrated: Product[] = [];
  for (const product of products) {
    const original = product.photoOriginalUrl;
    const image = product.imageUrl;
    const originalIsBase64 = Boolean(original?.startsWith("data:image/"));
    const imageIsBase64 = Boolean(image?.startsWith("data:image/"));
    if (!originalIsBase64 && !imageIsBase64) continue;

    let uploadedUrl: string | undefined;
    if (imageIsBase64 && originalIsBase64 && image === original) {
      uploadedUrl = await uploadProductPhoto(userId, product.id, image as string);
      migrated.push({ ...product, imageUrl: uploadedUrl, photoOriginalUrl: uploadedUrl });
    } else {
      const nextImageUrl = imageIsBase64
        ? await uploadProductPhoto(userId, product.id, image as string)
        : image;
      const nextOriginalUrl = originalIsBase64
        ? await uploadProductPhoto(userId, product.id, original as string)
        : original;
      migrated.push({ ...product, imageUrl: nextImageUrl, photoOriginalUrl: nextOriginalUrl });
    }

    const next = migrated[migrated.length - 1];
    // Sem filtro de user_id: em grupo compartilhado o produto pode pertencer a
    // outro membro (RLS valida a permissao de qualquer forma).
    const { error } = await supabase
      .from("products")
      .update({
        image_url: next.imageUrl ?? null,
        photo_original_url: next.photoOriginalUrl ?? null,
      })
      .eq("id", product.id);
    if (error) throw error;
  }
  return migrated;
}

async function uploadProductPhoto(userId: string, productId: string, uri: string): Promise<string> {
  const comma = uri.indexOf(",");
  const mime = uri.slice(5, comma).split(";")[0] || "image/jpeg";
  const binary = atob(uri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/${productId}.${extension}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, bytes.buffer, { contentType: mime, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
