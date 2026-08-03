import { useState } from "react";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../supabase";

WebBrowser.maybeCompleteAuthSession();

type Props = {
  onDemo?: () => void;
};

export function AuthScreen({ onDemo }: Props) {
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function signInWithGoogle() {
    setGoogleBusy(true);
    try {
      const redirectTo = makeRedirectUri({
        scheme: "prazocerto",
        path: "auth/callback",
      });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== "success") return;

      const { params, errorCode } = QueryParams.getQueryParams(result.url);
      if (errorCode) throw new Error(errorCode);
      const accessToken = String(params.access_token || "");
      const refreshToken = String(params.refresh_token || "");
      if (!accessToken || !refreshToken) {
        throw new Error("O Google não devolveu uma sessão válida.");
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) throw sessionError;
    } catch (error) {
      Alert.alert(
        "Não foi possível entrar com Google",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit() {
    if (!email.trim() || password.length < 6) {
      Alert.alert("Confira os dados", "Informe um e-mail válido e uma senha com pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    const result = creatingAccount
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);

    if (result.error) {
      Alert.alert("Não foi possível entrar", result.error.message);
      return;
    }
    if (creatingAccount && !result.data.session) {
      Alert.alert("Confirme seu e-mail", "Enviamos uma mensagem para confirmar sua conta. Depois, volte e entre no aplicativo.");
      setCreatingAccount(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      Alert.alert("Informe seu e-mail", "Digite o e-mail da sua conta primeiro.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    Alert.alert(
      error ? "Não foi possível enviar" : "E-mail enviado",
      error?.message || "Confira sua caixa de entrada para recuperar a senha.",
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {Platform.OS === "web" ? (
          <Pressable
            accessibilityRole="link"
            style={styles.portfolioBack}
            onPress={() => Linking.openURL("https://portfolio-3d-eight-nu.vercel.app/#projetos")}
          >
            <Text style={styles.portfolioBackText}>← VOLTAR AO PORTFÓLIO</Text>
          </Pressable>
        ) : null}
        <View style={styles.brand}>
          <Image source={require("../../assets/seal.png")} style={styles.logo} />
          <Text style={styles.title}>PRAZO <Text style={styles.titleLight}>CERTO</Text></Text>
          <Text style={styles.subtitle}>Seus produtos seguros e sincronizados</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{creatingAccount ? "Criar sua conta" : "Entrar na sua conta"}</Text>
          <Text style={styles.cardText}>Acesse seus produtos em qualquer celular.</Text>

          <Pressable
            style={[styles.googleButton, googleBusy && styles.disabled]}
            onPress={signInWithGoogle}
            disabled={googleBusy}
          >
            {googleBusy ? <ActivityIndicator color="#173F32" /> : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleText}>Continuar com Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou use seu e-mail</Text>
            <View style={styles.dividerLine} />
          </View>

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="seuemail@exemplo.com"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>Senha</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete={creatingAccount ? "new-password" : "current-password"}
            placeholder="Mínimo de 6 caracteres"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.primaryText}>{creatingAccount ? "CRIAR CONTA" : "ENTRAR"}</Text>
            )}
          </Pressable>

          {Platform.OS === "web" && onDemo ? (
            <Pressable style={styles.demoButton} onPress={onDemo}>
              <Text style={styles.demoButtonText}>ENTRAR PARA TESTAR</Text>
            </Pressable>
          ) : null}

          {!creatingAccount && (
            <Pressable onPress={resetPassword}><Text style={styles.link}>Esqueci minha senha</Text></Pressable>
          )}
          <Pressable onPress={() => setCreatingAccount((value) => !value)}>
            <Text style={styles.switchText}>
              {creatingAccount ? "Já possui uma conta? Entrar" : "Ainda não possui conta? Criar conta"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#174D3B" },
  page: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  portfolioBack: { alignSelf: "center", minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: "#BCE5CE", backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 18, paddingHorizontal: 16 },
  portfolioBackText: { color: "#E8F7EF", fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  brand: { alignItems: "center", marginBottom: 25 },
  logo: { width: 105, height: 105, resizeMode: "contain", marginBottom: 7 },
  title: { color: "#FFF", fontSize: 27, fontWeight: "900", letterSpacing: 1 },
  titleLight: { color: "#BCE5CE" },
  subtitle: { color: "#CFE3D9", fontSize: 13, marginTop: 6 },
  card: { backgroundColor: "#F8FAF7", borderRadius: 25, padding: 22 },
  cardTitle: { color: "#173F32", fontSize: 24, fontWeight: "800" },
  cardText: { color: "#738078", marginTop: 5, marginBottom: 19 },
  googleButton: { height: 52, borderWidth: 1, borderColor: "#CBD5CE", borderRadius: 14, backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11 },
  googleIcon: { color: "#4285F4", fontSize: 19, fontWeight: "900" },
  googleText: { color: "#243D34", fontSize: 15, fontWeight: "800" },
  divider: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#DCE3DE" },
  dividerText: { color: "#8A958E", fontSize: 11 },
  label: { color: "#354A41", fontSize: 12, fontWeight: "800", marginBottom: 6, marginTop: 9 },
  input: { height: 51, borderWidth: 1, borderColor: "#D3DDD7", borderRadius: 14, backgroundColor: "#FFF", paddingHorizontal: 14, color: "#173F32", fontSize: 15 },
  primary: { height: 53, borderRadius: 15, backgroundColor: "#23845D", alignItems: "center", justifyContent: "center", marginTop: 22 },
  primaryText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  demoButton: { height: 49, borderRadius: 15, borderWidth: 1, borderColor: "#23845D", alignItems: "center", justifyContent: "center", marginTop: 11 },
  demoButtonText: { color: "#176844", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  link: { color: "#267554", textAlign: "center", fontWeight: "700", marginTop: 16 },
  switchText: { color: "#53665C", textAlign: "center", fontWeight: "700", marginTop: 18 },
});
