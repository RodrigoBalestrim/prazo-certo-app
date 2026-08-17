/**
 * Tela de criação/entrada em grupo.
 *
 * Dois modos:
 * - "create": define nome do grupo, razão social, setor e logo; chama a RPC
 *   create_company, que gera o código de convite no banco.
 * - "join": digita o código de convite (uppercase) e chama join_company.
 *
 * Após concluir, onReady devolve o grupo criado/entrado para o app trocar de
 * escopo (lista pessoal -> lista do grupo).
 */
import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createCompany, joinCompany, loadMyCompany, CompanyMembership } from "../company";
import { uploadCompanyLogo } from "../companyLogo";
import { supabase } from "../supabase";
import { AppAlert, AlertButton, AlertMessage } from "./AppAlert";

type Props = {
  onReady: (company: CompanyMembership) => void;
  onCancel?: () => void;
  initialMode?: "create" | "join";
};

export function CompanyScreen({ onReady, onCancel, initialMode = "create" }: Props) {
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    setAlert({ title, message, buttons });
  }
  const [mode, setMode] = useState<"create" | "join">(initialMode);
  const [groupName, setGroupName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState("");
  const [logoDraft, setLogoDraft] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function chooseLogo() {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert("Permissao necessaria", "Permita o acesso as fotos para escolher a logo.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setLogoDraft(
        asset.base64
          ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
          : asset.uri,
      );
    }
  }

  async function submit() {
    const value = mode === "create" ? groupName.trim() : inviteCode.trim();
    if (!value) {
      showAlert(
        mode === "create" ? "Informe o nome do grupo" : "Informe o código",
        mode === "create" ? "Digite um nome para identificar o grupo de lista." : "Digite o código enviado pelo administrador.",
      );
      return;
    }

    setBusy(true);
    try {
      if (mode === "create") {
        const { data } = await supabase.auth.getUser();
        let uploadedLogoUrl = "";
        if (logoDraft && data.user?.id) uploadedLogoUrl = await uploadCompanyLogo(data.user.id, logoDraft);
        await createCompany(value, companyName, sector, uploadedLogoUrl);
      }
      else await joinCompany(value);
      const company = await loadMyCompany();
      if (!company) throw new Error("Não foi possível abrir o grupo.");
      onReady(company);
    } catch (error) {
      showAlert(
        mode === "create" ? "Não foi possível criar o grupo" : "Não foi possível entrar",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Image source={require("../../assets/seal.png")} style={styles.logo} />
        <Text style={styles.title}>GRUPO DE LISTA</Text>
        <Text style={styles.subtitle}>
          Compartilhe a mesma lista de produtos com todos os funcionários.
        </Text>

        <View style={styles.card}>
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, mode === "create" && styles.tabActive]}
              onPress={() => setMode("create")}
            >
              <Text style={[styles.tabText, mode === "create" && styles.tabTextActive]}>Criar grupo</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, mode === "join" && styles.tabActive]}
              onPress={() => setMode("join")}
            >
              <Text style={[styles.tabText, mode === "join" && styles.tabTextActive]}>Entrar com código</Text>
            </Pressable>
          </View>

          <Text style={styles.heading}>{mode === "create" ? "Novo grupo" : "Entrar em um grupo"}</Text>
          <Text style={styles.help}>
            {mode === "create"
              ? "Você será o administrador e receberá um código para convidar a equipe."
              : "Peça ao administrador o código de convite do grupo."}
          </Text>

          <TextInput
            autoCapitalize={mode === "create" ? "words" : "characters"}
            maxLength={mode === "create" ? 60 : 8}
            placeholder={mode === "create" ? "Nome do grupo" : "Ex.: AB12CD34"}
            style={styles.input}
            value={mode === "create" ? groupName : inviteCode}
            onChangeText={mode === "create" ? setGroupName : setInviteCode}
          />

          {mode === "create" ? (
            <>
              <TextInput
                autoCapitalize="words"
                maxLength={80}
                placeholder="Nome da empresa"
                style={[styles.input, styles.fieldGap]}
                value={companyName}
                onChangeText={setCompanyName}
              />
              <TextInput
                autoCapitalize="words"
                maxLength={50}
                placeholder="Setor responsavel"
                style={[styles.input, styles.fieldGap]}
                value={sector}
                onChangeText={setSector}
              />
              <View style={styles.logoPreview}>
                {logoDraft ? (
                  <Image source={{ uri: logoDraft }} style={styles.logoPreviewImage} />
                ) : (
                  <Image source={require("../../assets/seal.png")} style={styles.logoPreviewImage} />
                )}
                <View style={styles.logoPreviewTextWrap}>
                  <Text style={styles.logoPreviewTitle}>{logoDraft ? "Logo selecionada" : "Logo padrao"}</Text>
                  <Text style={styles.logoPreviewText}>Voce pode confirmar, trocar ou remover antes de criar.</Text>
                </View>
              </View>
              <View style={styles.logoActions}>
                <Pressable style={styles.logoButton} onPress={chooseLogo}>
                  <Text style={styles.logoButtonText}>{logoDraft ? "Trocar logo" : "Escolher logo"}</Text>
                </Pressable>
                {logoDraft ? (
                  <Pressable style={styles.logoCancelButton} onPress={() => setLogoDraft("")}>
                    <Text style={styles.logoCancelText}>Remover</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}

          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFF" /> : (
              <Text style={styles.primaryText}>{mode === "create" ? "CRIAR GRUPO" : "ENTRAR NO GRUPO"}</Text>
            )}
          </Pressable>
        </View>

        {onCancel ? (
          <Pressable onPress={onCancel}>
            <Text style={styles.logout}>Continuar usando minha lista pessoal</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={styles.logout}>Sair desta conta</Text>
          </Pressable>
        )}
      </View>
          <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#174D3B" },
  page: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 23 },
  logo: { width: 96, height: 96, resizeMode: "contain" },
  title: { color: "#FFF", fontSize: 23, fontWeight: "900", marginTop: 7 },
  subtitle: { color: "#CDE1D7", textAlign: "center", fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 22 },
  card: { width: "100%", backgroundColor: "#F8FAF7", borderRadius: 24, padding: 20 },
  tabs: { flexDirection: "row", backgroundColor: "#E8EEEA", borderRadius: 13, padding: 4, marginBottom: 21 },
  tab: { flex: 1, minHeight: 41, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: "#FFF" },
  tabText: { color: "#758279", fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: "#174D3B" },
  heading: { color: "#173F32", fontSize: 21, fontWeight: "900" },
  help: { color: "#718077", fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 16 },
  input: { height: 52, borderWidth: 1, borderColor: "#D1DCD5", borderRadius: 14, backgroundColor: "#FFF", paddingHorizontal: 14, color: "#173F32", fontSize: 16 },
  fieldGap: { marginTop: 10 },
  logoPreview: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 15, backgroundColor: "#E8F2EC", padding: 10, marginTop: 12 },
  logoPreviewImage: { width: 52, height: 52, borderRadius: 13, resizeMode: "contain", backgroundColor: "#FFF" },
  logoPreviewTextWrap: { flex: 1 },
  logoPreviewTitle: { color: "#173F32", fontSize: 13, fontWeight: "900" },
  logoPreviewText: { color: "#64776D", fontSize: 11, lineHeight: 15, marginTop: 3 },
  logoActions: { flexDirection: "row", gap: 9, marginTop: 10 },
  logoButton: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: "#174D3B", alignItems: "center", justifyContent: "center" },
  logoButtonText: { color: "#FFF", fontSize: 12, fontWeight: "900" },
  logoCancelButton: { minHeight: 42, borderRadius: 12, backgroundColor: "#F3E5E1", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  logoCancelText: { color: "#A13A2F", fontSize: 12, fontWeight: "900" },
  primary: { height: 53, borderRadius: 15, backgroundColor: "#23845D", alignItems: "center", justifyContent: "center", marginTop: 17 },
  primaryText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.65 },
  logout: { color: "#D5E5DD", fontWeight: "700", marginTop: 20 },
});
