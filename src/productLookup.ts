import { lookupCatalogProduct } from "./productCatalog";
import { ProductCategory } from "./types";

export type ProductLookupResult = {
  name: string | null;
  imageUrl: string | null;
  category?: ProductCategory | null;
};

// Limita cada consulta externa a 6s para a busca não ficar travada.
function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function lookupOpenFoodFacts(
  barcode: string,
): Promise<ProductLookupResult | null> {
  try {
    const response = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?product_type=all`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "PrazoCerto/1.0",
        },
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      status?: number;
      product?: {
        product_name_pt?: string;
        product_name?: string;
        abbreviated_product_name?: string;
        generic_name_pt?: string;
        generic_name?: string;
        brands?: string;
        image_front_small_url?: string;
        image_front_url?: string;
        image_url?: string;
      };
    };
    if (data.status !== 1) return null;
    const product = data.product;
    return {
      name:
        product?.product_name_pt?.trim() ||
        product?.product_name?.trim() ||
        product?.abbreviated_product_name?.trim() ||
        product?.generic_name_pt?.trim() ||
        product?.generic_name?.trim() ||
        product?.brands?.trim() ||
        null,
      imageUrl:
        product?.image_front_small_url ||
        product?.image_front_url ||
        product?.image_url ||
        null,
    };
  } catch {
    return null;
  }
}

async function lookupUpcItemDb(
  barcode: string,
): Promise<ProductLookupResult | null> {
  try {
    const response = await fetchWithTimeout(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      code?: string;
      items?: Array<{
        title?: string;
        brand?: string;
        images?: string[];
      }>;
    };
    const product = data.items?.[0];
    if (!product) return null;

    const title = product.title?.trim();
    const brand = product.brand?.trim();
    const name =
      title && brand && !title.toLowerCase().includes(brand.toLowerCase())
        ? `${title} — ${brand}`
        : title || brand || null;

    return {
      name,
      imageUrl: product.images?.find((url) => url.startsWith("https://")) || null,
    };
  } catch {
    return null;
  }
}

async function lookupGtinHub(
  barcode: string,
): Promise<ProductLookupResult | null> {
  try {
    const response = await fetchWithTimeout(
      `https://gtinhub.com/api/v1/product/${encodeURIComponent(barcode)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;

    const data = (await response.json()) as {
      found?: boolean;
      product?: {
        name?: string;
        brand?: string;
        image_url?: string;
      };
    };
    const product = data.product;
    if (!data.found || !product) return null;

    const name = product.name?.trim();
    const brand = product.brand?.trim();
    return {
      name:
        name && brand && !name.toLowerCase().includes(brand.toLowerCase())
          ? `${name} — ${brand}`
          : name || brand || null,
      imageUrl: product.image_url?.startsWith("http")
        ? product.image_url
        : null,
    };
  } catch {
    return null;
  }
}

export async function lookupProduct(
  barcode: string,
): Promise<ProductLookupResult | null> {
  const sharedProduct = await lookupCatalogProduct(barcode);
  if (sharedProduct) {
    return {
      name: sharedProduct.name,
      imageUrl: sharedProduct.imageUrl,
      category: sharedProduct.category,
    };
  }

  // Open Food Facts e UPCItemDB em paralelo (cada uma com timeout de 6s).
  const [openFoodFacts, upcItemDb] = await Promise.allSettled([
    lookupOpenFoodFacts(barcode),
    lookupUpcItemDb(barcode),
  ]);
  const off = openFoodFacts.status === "fulfilled" ? openFoodFacts.value : null;
  const upc = upcItemDb.status === "fulfilled" ? upcItemDb.value : null;

  const partialResult = {
    name: off?.name || upc?.name || null,
    imageUrl: off?.imageUrl || upc?.imageUrl || null,
  };

  // GTINHub é limitado; só o usamos quando as duas primeiras não trazem o nome.
  if (partialResult.name) return partialResult;

  const gtinHub = await lookupGtinHub(barcode);
  const result = {
    name: gtinHub?.name || null,
    imageUrl: partialResult.imageUrl || gtinHub?.imageUrl || null,
  };
  return result.name || result.imageUrl ? result : null;
}
