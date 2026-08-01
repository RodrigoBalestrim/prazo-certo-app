import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "./types";

const STORAGE_KEY = "@prazo-certo/products";

export async function loadProducts(userId?: string): Promise<Product[]> {
  const raw = await AsyncStorage.getItem(userId ? `${STORAGE_KEY}/${userId}` : STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Product[];
  } catch {
    return [];
  }
}

export async function saveProducts(products: Product[], userId?: string): Promise<void> {
  await AsyncStorage.setItem(userId ? `${STORAGE_KEY}/${userId}` : STORAGE_KEY, JSON.stringify(products));
}
