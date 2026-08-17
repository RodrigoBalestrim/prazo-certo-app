/**
 * Cache local (AsyncStorage) da lista de produtos.
 *
 * O app funciona OFFLINE-FIRST: a lista que o usuário vê vem deste cache e a
 * nuvem é atualizada em seguida (ver cloudStorage). Este módulo também marca
 * sincronizações pendentes — quando o usuário adiciona/edit/exclui sem
 * internet, um flag avisa o app para reenviar assim que reconectar.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "./types";

const STORAGE_KEY = "@prazo-certo/products";

export async function loadProducts(userId?: string): Promise<Product[]> {
  // Chave por usuário impede que o cache de uma sessão apareça em outra.
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

const PENDING_KEY_PREFIX = "@prazo-certo/pending-sync/";

// Marca alterações locais pendentes. A sincronização tenta reenviar ao app voltar ao primeiro plano.
export async function markSyncPending(scopeKey: string): Promise<void> {
  await AsyncStorage.setItem(`${PENDING_KEY_PREFIX}${scopeKey}`, "1");
}

export async function clearSyncPending(scopeKey: string): Promise<void> {
  await AsyncStorage.removeItem(`${PENDING_KEY_PREFIX}${scopeKey}`);
}

export async function isSyncPending(scopeKey: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(`${PENDING_KEY_PREFIX}${scopeKey}`);
  return raw === "1";
}