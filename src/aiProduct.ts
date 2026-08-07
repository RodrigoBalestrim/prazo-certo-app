import { supabase } from "./supabase";
import { Product, ProductCategory } from "./types";

export type AiProductMatch = {
  name: string;
  similarity: number;
};

export type AiProductAnalysis = {
  processed: boolean;
  name: string | null;
  brand: string | null;
  category: ProductCategory | null;
  description: string | null;
  packagingType: string | null;
  matches: AiProductMatch[];
  originalUrl: string | null;
  cutoutUrl: string | null;
  backgroundRemoved: boolean;
};

export type AiAnalysisInput = {
  barcode?: string;
  imageUri: string;
  existingProductNames?: string[];
};

// Chama a Edge Function "analyze-product": análise por foto + remoção de fundo
// + comparação com produtos já cadastrados (evita duplicidade).
export async function analyzeProductWithAi(input: AiAnalysisInput): Promise<AiProductAnalysis> {
  const isDataUri = /^data:image\//.test(input.imageUri);
  const { data, error } = await supabase.functions.invoke("analyze-product", {
    body: {
      barcode: input.barcode || "",
      imageBase64: isDataUri ? input.imageUri : undefined,
      imageUrl: isDataUri ? undefined : input.imageUri,
      existingProducts: input.existingProductNames || [],
    },
  });
  if (error) {
    throw new Error(
      typeof error.message === "string"
        ? error.message
        : "Não foi possível acessar o assistente de IA.",
    );
  }
  const analysis = data as Partial<AiProductAnalysis>;
  return {
    processed: Boolean(analysis.processed),
    name: analysis.name || null,
    brand: analysis.brand || null,
    category: (analysis.category as ProductCategory) || null,
    description: analysis.description || null,
    packagingType: analysis.packagingType || null,
    matches: analysis.matches || [],
    originalUrl: analysis.originalUrl || null,
    cutoutUrl: analysis.cutoutUrl || null,
    backgroundRemoved: Boolean(analysis.backgroundRemoved),
  };
}

// Registra o histórico de imagens (foto original + sem fundo + data + usuário).
export async function recordImageHistory(input: {
  productId: string;
  originalUrl?: string;
  cutoutUrl?: string;
  status?: "done" | "failed";
  errorMessage?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from("product_image_history").insert({
      product_id: input.productId,
      original_url: input.originalUrl || null,
      cutout_url: input.cutoutUrl || null,
      status: input.status || "done",
      error_message: input.errorMessage || null,
      processed_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch {
    // Histórico de imagem é best-effort.
  }
}

// Gera a lista de nomes já cadastrados para a comparação de duplicidade.
export function existingProductNames(products: Product[]): string[] {
  return [...new Set(products.map((product) => product.name).filter(Boolean))].slice(0, 40);
}
