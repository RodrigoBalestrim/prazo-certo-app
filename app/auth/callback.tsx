import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from "react-native";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { router, useLocalSearchParams } from "expo-router";
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
  // Depois de 15s sem o deep link chegar, sai do modo "aguardando" e
  // mostra o erro - a tela nunca fica presa para sempre.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [retryCount]);
  const callbackUrl = Linking.useURL();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const routeParamsKey = JSON.stringify(routeParams);

  useEffect(() => {
    async function finishLogin() {
      try {
        // Se a sessao ja foi criada (AuthScreen tambem processa o retorno),
        // navega direto - nao fica preso na tela.
        const current = await supabase.auth.getSession();
        if (current.data.session) {
          router.replace("/");
          return;
        }

        const url = callbackUrl || await Linking.getInitialURL();
        let params: Record<string, string> = {};
        if (url) {
          const parsed = QueryParams.getQueryParams(url);
          if (parsed.errorCode) throw new Error(String(parsed.params.error_description || parsed.errorCode));
          params = { ...parsed.params };
        }
        // Fallback: o expo-router ja parseou a URL em params de rota.
        for (const [key, value] of Object.entries(routeParams)) {
          if (typeof value === "string" && !params[key]) params[key] = value;
        }

        const accessToken = String(params.access_token || "");
        const refreshToken = String(params.refresh_token || "");
        const code = String(params.code || "");
        if (!accessToken && !refreshToken && !code) {
          if (!timedOut && retryCount === 0) return; // aguarda o deep link
          throw new Error("O retorno do Google não chegou. Tente novamente.");
        }

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

    // Roda SEMPRE ao montar: no Android (app ja aberto) o deep link nem sempre
    // chega no useURL() - antes, finishLogin nunca rodava e a tela ficava
    // travada em "Concluindo seu login..." para sempre.
    finishLogin();
  }, [callbackUrl, retryCount, routeParamsKey, timedOut]);

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
      <Text style={styles.buildTag}>
        {Constants.expoConfig?.version || "2.0.0"} ·{" "}
        {String(process.env.EXPO_PUBLIC_BUILD_SHA || "dev").slice(0, 7)}
      </Text>
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
  buildTag: { position: "absolute", right: 10, bottom: 6, color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "600" },
});
