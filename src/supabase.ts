/**
 * Cliente Supabase único.
 *
 * - A sessão persiste em AsyncStorage (o app continua logado entre aberturas)
 *   e o token é renovado automaticamente.
 * - detectSessionInUrl:false porque o login web/Google é tratado pela tela
 *   AuthCallback, não por URL de deep link.
 * - As chaves são PÚBLICAS (anon): a segurança real está nas políticas RLS.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Configuração do Supabase não encontrada.");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
