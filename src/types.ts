/** Tipos de domínio compartilhados entre telas, armazenamento e sincronização. */
export const PRODUCT_CATEGORIES = [
  "Mercearia",
  "Açougue",
  "Frios/PAS",
  "Bazar",
  "Saudáveis",
  "FLV",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type Product = {
  id: string;
  name: string;
  imageUrl?: string;
  photoOriginalUrl?: string;
  photoCutoutUrl?: string;
  brand?: string;
  description?: string;
  packagingType?: string;
  category?: ProductCategory;
  barcode: string;
  expiresAt: string;
  quantity: number;
  notes?: string;
  archived?: boolean;
  archivedAt?: string;
  rebaixaAprovada?: boolean;
  rebaixaData?: string;
  createdAt: string;
  notificationIds: string[];
};

export type ProductDraft = Pick<
  Product,
  "name" | "barcode" | "expiresAt" | "quantity"
>;
