/**
 * Layout raiz do Expo Router.
 *
 * Configura a pilha de rotas (todas sem header próprio, o app desenha o
 * próprio cabeçalho). app/index.tsx é a tela principal; app/auth/callback.tsx
 * processa o retorno do login OAuth.
 */
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
