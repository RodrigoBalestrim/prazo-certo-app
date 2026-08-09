import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { router } from "expo-router";
import { supabase } from "@/supabase";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("A conexão demorou e foi cancelada.")),
      ms,
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState("Concluindo seu login...");
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const callbackUrl = Linking.useURL();

  useEffect(() => {
    async function finishLogin() {
      try {
        const url = callbackUrl || await Linking.getInitialURL();
        if (!url) throw new Error("Endereço de retorno não encontrado.");

        const { params, errorCode } = QueryParams.getQueryParams(url);
        if (errorCode) throw new Error(String(params.error_description || errorCode));

        const accessToken = String(params.access_token || "");
        const refreshToken = String(params.refresh_token || "");
        const code = String(params.code || "");

        // Timeout de 20s: o projeto Free do Supabase hiberna e a primeira
        // chamada pode demorar; sem isso a tela trava para sempre.
        await withTimeout((async () => {
          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          } else if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          } else {
            const { data } = await supabase.auth.getSession();
            if (!data.session) throw new Error("O Google não devolveu uma sessão válida.");
          }
        })(), 20000);

        router.replace("/");
      } catch (error) {
        setMessage(
          error instanceof Error
            ? `${error.message} Tente novamente ou entre com e-mail e senha.`
            : "Não foi possível concluir o login.",
        );
        setFailed(true);
      }
    }

    if (callbackUrl) finishLogin();
  }, [callbackUrl, retryCount]);

  return (
    <SafeAreaView style={styles.page}>
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={styles.text}>{message}</Text>
      {failed ? (
        <Pressable
          style={styles.retry}
          onPress={() => {
            setFailed(false);
            setMessage("Concluindo seu login...");
            setRetryCount((count) => count + 1);
          }}
        >
          <Text style={styles.retryText}>TENTAR NOVAMENTE</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#174D3B",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 18,
  },
  text: {
    color: "#FFFFFF",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
  },
  retry: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#23845D",
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
