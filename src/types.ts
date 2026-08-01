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
  category?: ProductCategory;
  barcode: string;
  expiresAt: string;
  quantity: number;
  createdAt: string;
  notificationIds: string[];
};

export type ProductDraft = Pick<
  Product,
  "name" | "barcode" | "expiresAt" | "quantity"
>;
