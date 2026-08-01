import { useEffect, useState } from "react";
import { ActivityIndicator, SafeAreaView, StyleSheet, Text } from "react-native";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { router } from "expo-router";
import { supabase } from "@/supabase";

export default function AuthCallbackScreen() {
  const [message, setMessage] = useState("Concluindo seu login...");
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

        router.replace("/");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Não foi possível concluir o login.");
      }
    }

    if (callbackUrl) finishLogin();
  }, [callbackUrl]);

  return (
    <SafeAreaView style={styles.page}>
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={styles.text}>{message}</Text>
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
});
