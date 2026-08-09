import { useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CompanyMember,
  CompanyMembership,
  CompanyRole,
  COMPANY_ROLE_LABELS,
  MANAGED_ROLES,
  loadCompanyMembers,
  loadMyCompany,
  removeCompanyLogo,
  removeCompanyMember,
  setMemberActive,
  updateCompany,
  updateMemberRole,
} from "../company";
import { uploadCompanyLogo } from "../companyLogo";
import { compressImageForUpload } from "../imageUtils";
import { AppAlert, AlertButton, AlertMessage } from "./AppAlert";

type Props = {
  visible: boolean;
  company: CompanyMembership;
  currentUserId: string;
  onClose: () => void;
  onCompanyChange?: (company: CompanyMembership) => void;
};

export function CompanyManagerModal({ visible, company, currentUserId, onClose, onCompanyChange }: Props) {
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    setAlert({ title, message, buttons });
  }
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [changingRoleFor, setChangingRoleFor] = useState<string | null>(null);
  const [togglingActiveFor, setTogglingActiveFor] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  const canManage = company.role === "owner" || company.role === "admin";

  async function refresh() {
    setLoading(true);
    try {
      setMembers(await loadCompanyMembers());
    } catch (error) {
      showAlert(
        "Não foi possível carregar a equipe",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) refresh();
  }, [visible]);

  async function refreshCompany() {
    try {
      const latest = await loadMyCompany();
      if (latest) onCompanyChange?.(latest);
    } catch {
      // Mantém o estado atual em caso de falha.
    }
  }

  async function invite() {
    await Share.share({
      title: `Convite para ${company.name}`,
      message:
        `Entre no grupo ${company.name} no aplicativo Prazo Certo.\n\n` +
        `Código do grupo: ${company.inviteCode}`,
    });
  }

  function confirmRemove(member: CompanyMember) {
    showAlert(
      "Remover participante",
      `Deseja remover ${member.name} deste grupo?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await removeCompanyMember(member.userId);
              await refresh();
            } catch (error) {
              showAlert(
                "Não foi possível remover",
                error instanceof Error ? error.message : "Tente novamente.",
              );
            }
          },
        },
      ],
    );
  }

  async function changeRole(member: CompanyMember, role: CompanyRole) {
    if (role === member.role) return;
    setChangingRoleFor(member.userId);
    try {
      await updateMemberRole(member.userId, role);
      await refresh();
    } catch (error) {
      showAlert(
        "Não foi possível alterar a função",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setChangingRoleFor(null);
    }
  }


  async function toggleActive(member: CompanyMember) {
    setTogglingActiveFor(member.userId);
    try {
      await setMemberActive(member.userId, !member.active);
      await refresh();
    } catch (error) {
      showAlert(
        "Não foi possível alterar o status",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setTogglingActiveFor(null);
    }
  }

  async function chooseLogo() {
    if (Platform.OS !== "web") {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showAlert("Permissão necessária", "Permita o acesso às fotos para escolher a logo.");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.base64
      ? `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`
      : asset.uri;
    setLogoBusy(true);
    try {
      const uploadedUrl = await uploadCompanyLogo(currentUserId, await compressImageForUpload(uri));
      await updateCompany({ logoUrl: uploadedUrl });
      await refreshCompany();
      showAlert("Logo atualizada", "A logo da empresa foi salva com sucesso.");
    } catch (error) {
      showAlert(
        "Não foi possível enviar a logo",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    } finally {
      setLogoBusy(false);
    }
  }

  function confirmRemoveLogo() {
    showAlert(
      "Remover logo",
      "Deseja remover a logo da empresa? O Prazo Certo voltará a usar a logo padrão.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            setLogoBusy(true);
            try {
              await removeCompanyLogo();
              await refreshCompany();
            } catch (error) {
              showAlert(
                "Não foi possível remover",
                error instanceof Error ? error.message : "Tente novamente.",
              );
            } finally {
              setLogoBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.safe}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>‹ Voltar</Text>
          </Pressable>
          <Text style={styles.title}>GERENCIAR EQUIPE</Text>
          <View style={styles.headerSpace} />
        </View>

        <View style={styles.companyCard}>
          <Text style={styles.companyLabel}>GRUPO DE LISTA</Text>
          <Text style={styles.companyName}>{company.name}</Text>
          <Text style={styles.code}>Código: {company.inviteCode}</Text>
          {canManage ? (
            <View style={styles.logoBox}>
              <View style={styles.logoRow}>
                {company.logoUrl ? (
                  <Image source={{ uri: company.logoUrl }} style={styles.logoImage} />
                ) : (
                  <Image source={require("../../assets/seal.png")} style={styles.logoImage} />
                )}
                <View style={styles.logoTextWrap}>
                  <Text style={styles.logoTitle}>
                    {company.logoUrl ? "Logo da empresa" : "Logo padrão"}
                  </Text>
                  <Text style={styles.logoHelp}>
                    {company.logoUrl ? "Toque para trocar ou remover." : "Adicione a logo da sua empresa."}
                  </Text>
                </View>
              </View>
              <View style={styles.logoActions}>
                <Pressable style={styles.logoButton} onPress={chooseLogo} disabled={logoBusy}>
                  {logoBusy ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <Text style={styles.logoButtonText}>{company.logoUrl ? "Trocar logo" : "Escolher logo"}</Text>
                  )}
                </Pressable>
                {company.logoUrl ? (
                  <Pressable style={styles.logoRemoveButton} onPress={confirmRemoveLogo} disabled={logoBusy}>
                    <Text style={styles.logoRemoveText}>Remover</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          <Pressable style={styles.inviteButton} onPress={invite}>
            <Text style={styles.inviteButtonText}>＋ CONVIDAR FUNCIONÁRIO</Text>
          </Pressable>
          <Text style={styles.inviteHelp}>
            Envie o código. A pessoa entra na conta dela e toca em "Entrar com código".
          </Text>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Participantes</Text>
          <Text style={styles.count}>{members.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#23845D" style={styles.loading} />
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>Nenhum participante encontrado.</Text>}
            renderItem={({ item }) => (
              <View style={[styles.member, !item.active && styles.memberInactive]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberEmail}>{item.email}</Text>
                  <Text style={styles.role}>
                    {COMPANY_ROLE_LABELS[item.role]}
                    {!item.active ? "  •  Inativo" : ""}
                  </Text>
                  {canManage && item.role !== "owner" ? (
                    <View style={styles.roleRow}>
                      {MANAGED_ROLES.map((role) => {
                        const activeRole = item.role === role;
                        const busy = changingRoleFor === item.userId;
                        return (
                          <Pressable
                            key={role}
                            disabled={busy}
                            style={[styles.roleChip, activeRole && styles.roleChipActive]}
                            onPress={() => changeRole(item, role)}
                          >
                            <Text style={[styles.roleChipText, activeRole && styles.roleChipTextActive]}>
                              {COMPANY_ROLE_LABELS[role]}
                            </Text>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        disabled={togglingActiveFor === item.userId}
                        style={[styles.activeChip, !item.active && styles.activeChipOff]}
                        onPress={() => toggleActive(item)}
                      >
                        {togglingActiveFor === item.userId ? (
                          <ActivityIndicator size="small" color="#176844" />
                        ) : (
                          <Text style={styles.activeChipText}>
                            {item.active ? "Desativar" : "Ativar"}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                {item.userId !== currentUserId && item.role !== "owner" ? (
                  <Pressable style={styles.removeButton} onPress={() => confirmRemove(item)}>
                    <Text style={styles.removeText}>Remover</Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </Modal>
      <AppAlert alert={alert} onClose={() => setAlert(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F6F2", paddingTop: 38 },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 76, minHeight: 40, justifyContent: "center" },
  backText: { color: "#176844", fontSize: 14, fontWeight: "800" },
  title: { color: "#173D31", fontSize: 16, fontWeight: "900" },
  headerSpace: { width: 76 },
  companyCard: { marginHorizontal: 20, backgroundColor: "#174D3B", borderRadius: 22, padding: 20 },
  companyLabel: { color: "#A9D2BF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  companyName: { color: "#FFF", fontSize: 23, fontWeight: "900", marginTop: 6 },
  code: { color: "#D1E5DB", fontSize: 13, marginTop: 5 },
  logoBox: { backgroundColor: "rgba(255,255,255,0.09)", borderRadius: 15, padding: 12, marginTop: 13 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  logoImage: { width: 46, height: 46, borderRadius: 11, resizeMode: "contain", backgroundColor: "#FFF" },
  logoTextWrap: { flex: 1 },
  logoTitle: { color: "#FFF", fontSize: 13, fontWeight: "800" },
  logoHelp: { color: "#CFE0D8", fontSize: 10, marginTop: 3 },
  logoActions: { flexDirection: "row", gap: 8, marginTop: 10 },
  logoButton: { flex: 1, minHeight: 36, borderRadius: 10, backgroundColor: "#E5AC4F", alignItems: "center", justifyContent: "center" },
  logoButtonText: { color: "#173D31", fontSize: 11, fontWeight: "900" },
  logoRemoveButton: { minHeight: 36, borderRadius: 10, backgroundColor: "#4B2421", paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  logoRemoveText: { color: "#F6C7C2", fontSize: 11, fontWeight: "900" },
  inviteButton: { height: 49, backgroundColor: "#E5AC4F", borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 14 },
  inviteButtonText: { color: "#173D31", fontSize: 13, fontWeight: "900" },
  inviteHelp: { color: "#CFE0D8", fontSize: 11, lineHeight: 16, marginTop: 10 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, marginTop: 24, marginBottom: 10 },
  listTitle: { color: "#203D33", fontSize: 19, fontWeight: "900" },
  count: { minWidth: 29, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "#DDEEE5", color: "#176844", textAlign: "center", fontWeight: "900" },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 10 },
  empty: { color: "#718077", textAlign: "center", marginTop: 30 },
  member: { minHeight: 84, backgroundColor: "#FFF", borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E3E9E4" },
  memberInactive: { opacity: 0.62 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#DDEEE5", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#174D3B", fontSize: 20, fontWeight: "900" },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { color: "#203D33", fontSize: 15, fontWeight: "800" },
  memberEmail: { color: "#7B8781", fontSize: 11, marginTop: 2 },
  role: { color: "#23845D", fontSize: 10, fontWeight: "800", marginTop: 5 },
  roleRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  roleChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: "#EEF2EE", borderWidth: 1, borderColor: "#DDE5DD" },
  roleChipActive: { backgroundColor: "#176844", borderColor: "#176844" },
  roleChipText: { color: "#5B6B63", fontSize: 10, fontWeight: "700" },
  roleChipTextActive: { color: "#FFF" },
  activeChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: "#FCE7E4", borderWidth: 1, borderColor: "#F3CCC6", minHeight: 27, justifyContent: "center" },
  activeChipOff: { backgroundColor: "#DDEEE5", borderColor: "#C2DCCB" },
  activeChipText: { color: "#A13A2F", fontSize: 10, fontWeight: "800" },
  removeButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#F5E5E2" },
  removeText: { color: "#A13A2F", fontSize: 10, fontWeight: "900" },
});
