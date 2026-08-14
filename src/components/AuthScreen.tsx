import { useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeRedirectUri } from "expo-auth-session";
import * as ImagePicker from "expo-image-picker";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../supabase";
import { uploadAvatar } from "../avatar";
import { AppAlert, AlertButton, AlertMessage } from "./AppAlert";

WebBrowser.maybeCompleteAuthSession();
const COMMON_PASSWORDS = new Set(["12345678", "123456789", "senha123", "password", "qwerty123", "admin123"]);

function passwordIssue(password: string, email: string, name: string): string | null {
  const normalized = password.trim().toLowerCase();
  const emailName = email.trim().toLowerCase().split("@")[0];
  const firstName = name.trim().toLowerCase().split(/\s+/)[0];
  if (password.length < 8) return "Use pelo menos 8 caracteres.";
  if (COMMON_PASSWORDS.has(normalized)) return "Escolha uma senha menos comum.";
  if ((emailName.length >= 3 && normalized.includes(emailName)) || (firstName.length >= 3 && normalized.includes(firstName))) return "Não use seu nome ou e-mail na senha.";
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

type Props = {
  onDemo?: () => void;
};

function GoogleIcon() {
  return (
    <Svg width={19} height={19} viewBox="0 0 18 18" accessibilityLabel="Google">
      <Path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.716v2.259h2.909c1.702-1.567 2.684-3.874 2.684-6.616Z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.468-.806 5.956-2.179l-2.909-2.259c-.806.54-1.836.859-3.047.859-2.344 0-4.328-1.584-5.037-3.71H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <Path
        fill="#FBBC05"
        d="M3.963 10.711A5.41 5.41 0 0 1 3.682 9c0-.594.102-1.17.281-1.711V4.957H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.043l3.007-2.332Z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.579c1.322 0 2.508.454 3.441 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.957l3.007 2.332C4.672 5.163 6.656 3.579 9 3.579Z"
      />
    </Svg>
  );
}

export function AuthScreen({ onDemo }: Props) {
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    setAlert({ title, message, buttons });
  }
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [fullName, setFullName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function chooseProfilePhoto() {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert("Permissão necessária", "Permita o acesso às fotos para escolher uma imagem.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setProfilePhoto(
        asset.base64
          ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
          : asset.uri,
      );
    }
  }

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

      // No Android, redirect com scheme customizado nao volta para
      // openAuthSessionAsync - o deep link abre a tela de callback, que
      // conclui o login. Timeout evita o botao do Google travar para sempre.
      const result = await withTimeout(
        WebBrowser.openAuthSessionAsync(data.url, redirectTo),
        45000,
      ).catch(() => null);
      if (result?.type !== "success") return;

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
      showAlert(
        "Não foi possível entrar com Google",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setGoogleBusy(false);
    }
  }

  async function submit() {
    if (creatingAccount && fullName.trim().length < 3) {
      showAlert("Informe seu nome", "Digite seu nome completo para criar a conta.");
      return;
    }    if (!email.trim() || !password) {
      showAlert("Confira os dados", "Informe e-mail e senha.");
      return;
    }
    if (creatingAccount) {
      const issue = passwordIssue(password, email, fullName);
      if (issue) {
        showAlert("Senha insegura", issue);
        return;
      }
    }
    if (creatingAccount && password !== passwordConfirmation) {
      showAlert("Senhas diferentes", "A confirmação deve ser igual à senha informada.");
      return;
    }

    setBusy(true);
    const authCall = creatingAccount
      ? supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        })
      : supabase.auth.signInWithPassword({ email: email.trim(), password });
    // Timeout de 25s: servidor frio (plano Free) pode demorar na 1a chamada.
    // Sem limite, o spinner fica infinito e o usuario fecha o app.
    const result = await withTimeout(authCall, 25000).catch(() => null);
    setBusy(false);
    if (!result) {
      showAlert(
        "A conexão demorou",
        "O servidor não respondeu. Tente novamente em instantes.",
      );
      return;
    }

    if (result.error) {
      showAlert("Não foi possível entrar", result.error.message);
      return;
    }
    if (creatingAccount && profilePhoto && result.data.user) {
      try {
        if (result.data.session) {
          await uploadAvatar(result.data.user.id, profilePhoto);
        } else {
          await AsyncStorage.setItem(
            `@prazo-certo/pending-avatar/${email.trim().toLowerCase()}`,
            profilePhoto,
          );
        }
      } catch {
        showAlert(
          "Conta criada",
          "A conta foi criada, mas a foto não pôde ser enviada agora. Você poderá adicioná-la pelo perfil.",
        );
      }
    }
    if (creatingAccount && !result.data.session) {
      showAlert("Confirme seu e-mail", "Enviamos uma mensagem para confirmar sua conta. Depois, volte e entre no aplicativo.");
      setCreatingAccount(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      showAlert("Informe seu e-mail", "Digite o e-mail da sua conta primeiro.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    showAlert(
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
        <ScrollView
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
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
          <Text style={styles.cardText}>
            {creatingAccount
              ? "Preencha seus dados para começar a organizar as validades."
              : "Acesse seus produtos em qualquer celular."}
          </Text>

          <Pressable
            style={[styles.googleButton, googleBusy && styles.disabled]}
            onPress={signInWithGoogle}
            disabled={googleBusy}
          >
            {googleBusy ? <ActivityIndicator color="#173F32" /> : (
              <>
                <GoogleIcon />
                <Text style={styles.googleText}>Continuar com Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou use seu e-mail</Text>
            <View style={styles.dividerLine} />
          </View>

          {creatingAccount ? (
            <>
              <View style={styles.signupPhotoSection}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.signupPhoto} />
                ) : (
                  <View style={styles.signupPhotoFallback}>
                    <Text style={styles.signupPhotoInitial}>
                      {(fullName.trim().charAt(0) || "?").toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.signupPhotoActions}>
                  <Pressable style={styles.signupPhotoButton} onPress={chooseProfilePhoto}>
                    <Text style={styles.signupPhotoButtonText}>
                      {profilePhoto ? "Trocar foto" : "Adicionar foto"}
                    </Text>
                  </Pressable>
                  {profilePhoto ? (
                    <Pressable onPress={() => setProfilePhoto("")}>
                      <Text style={styles.signupPhotoRemove}>Remover</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <Text style={styles.label}>Nome completo</Text>
              <TextInput
                autoCapitalize="words"
                autoComplete="name"
                placeholder="Seu nome completo"
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
              />
            </>
          ) : null}

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
            placeholder="Mínimo de 8 caracteres"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />

          {creatingAccount ? (
            <>
              <Text style={styles.label}>Confirmar senha</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                placeholder="Digite a senha novamente"
                secureTextEntry
                style={styles.input}
                value={passwordConfirmation}
                onChangeText={setPasswordConfirmation}
              />
            </>
          ) : null}

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

          {creatingAccount ? (
            <Pressable
              onPress={() => {
                setCreatingAccount(false);
                setPasswordConfirmation("");
              }}
            >
              <Text style={styles.switchText}>Já possui uma conta? Voltar para entrar</Text>
            </Pressable>
          ) : (
            <View style={styles.signupPrompt}>
              <Pressable
                style={styles.signupButton}
                onPress={() => {
                  setCreatingAccount(true);
                  setPasswordConfirmation("");
                }}
              >
                <Text style={styles.signupButtonText}>CRIAR MINHA CONTA</Text>
              </Pressable>
              <Text style={styles.signupQuestion}>Ainda não possui uma conta?</Text>
            </View>
          )}
          {!creatingAccount && (
            <Pressable onPress={resetPassword}>
              <Text style={styles.link}>Esqueci minha senha</Text>
            </Pressable>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
          <AppAlert alert={alert} onClose={() => setAlert(null)} />
          <Text style={styles.buildTag}>
            {Constants.expoConfig?.version || "2.0.0"} ·{" "}
            {String(process.env.EXPO_PUBLIC_BUILD_SHA || "dev").slice(0, 7)}
          </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#174D3B" },
  page: { flex: 1 },
  pageContent: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  portfolioBack: { alignSelf: "center", minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: "#BCE5CE", backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 18, paddingHorizontal: 16 },
  portfolioBackText: { color: "#E8F7EF", fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  brand: { alignItems: "center", marginBottom: 25 },
  logo: { width: 105, height: 105, resizeMode: "contain", marginBottom: 7 },
  title: { color: "#FFF", fontSize: 27, fontWeight: "900", letterSpacing: 1 },
  titleLight: { color: "#BCE5CE" },
  subtitle: { color: "#CFE3D9", fontSize: 13, marginTop: 6 },
  card: { backgroundColor: "#F8FAF7", borderRadius: 25, padding: 22 },
  cardTitle: { color: "#173F32", fontSize: 24, fontWeight: "800", textAlign: "center" },
  cardText: { color: "#738078", marginTop: 5, marginBottom: 19, textAlign: "center" },
  googleButton: { height: 52, borderWidth: 1, borderColor: "#CBD5CE", borderRadius: 14, backgroundColor: "#FFF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 11 },
  googleText: { color: "#243D34", fontSize: 15, fontWeight: "800" },
  divider: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 18, marginBottom: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#DCE3DE" },
  dividerText: { color: "#8A958E", fontSize: 11 },
  signupPhotoSection: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 12, marginBottom: 3, padding: 12, borderRadius: 15, backgroundColor: "#EAF3EE" },
  signupPhoto: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: "#23845D" },
  signupPhotoFallback: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: "#8EB7A3", backgroundColor: "#D9EAE1", alignItems: "center", justifyContent: "center" },
  signupPhotoInitial: { color: "#176844", fontSize: 25, fontWeight: "900" },
  signupPhotoActions: { flex: 1, alignItems: "flex-start", gap: 7 },
  signupPhotoButton: { minHeight: 34, borderRadius: 10, backgroundColor: "#23845D", paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  signupPhotoButtonText: { color: "#FFF", fontSize: 11, fontWeight: "900" },
  signupPhotoRemove: { color: "#A13A2F", fontSize: 10, fontWeight: "800", paddingHorizontal: 4 },
  label: { color: "#354A41", fontSize: 12, fontWeight: "800", marginBottom: 6, marginTop: 9 },
  input: { height: 51, borderWidth: 1, borderColor: "#D3DDD7", borderRadius: 14, backgroundColor: "#FFF", paddingHorizontal: 14, color: "#173F32", fontSize: 15 },
  primary: { height: 53, borderRadius: 15, backgroundColor: "#23845D", alignItems: "center", justifyContent: "center", marginTop: 22 },
  primaryText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  demoButton: { alignSelf: "flex-end", minHeight: 29, borderRadius: 9, borderWidth: 1, borderColor: "#B9CEC2", backgroundColor: "#F2F7F4", alignItems: "center", justifyContent: "center", marginTop: 9, paddingHorizontal: 10 },
  demoButtonText: { color: "#678076", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  disabled: { opacity: 0.65 },
  link: { color: "#267554", textAlign: "center", fontWeight: "700", marginTop: 16 },
  switchText: { color: "#53665C", textAlign: "center", fontWeight: "700", marginTop: 18 },
  buildTag: { position: "absolute", right: 10, bottom: 6, color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: "600" },
  signupPrompt: { marginTop: 20, paddingTop: 17, borderTopWidth: 1, borderTopColor: "#DCE3DE", alignItems: "center" },
  signupQuestion: { color: "#66776E", fontSize: 12, fontWeight: "600", marginTop: 9 },
  signupButton: { width: "100%", height: 49, borderRadius: 14, borderWidth: 2, borderColor: "#23845D", backgroundColor: "#EAF5EF", alignItems: "center", justifyContent: "center" },
  signupButtonText: { color: "#176844", fontSize: 13, fontWeight: "900", letterSpacing: 0.3 },
});
