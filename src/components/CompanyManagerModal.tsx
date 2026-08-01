import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CompanyMember,
  CompanyMembership,
  loadCompanyMembers,
  removeCompanyMember,
} from "../company";

type Props = {
  visible: boolean;
  company: CompanyMembership;
  currentUserId: string;
  onClose: () => void;
};

const roleLabels = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Funcionário",
};

export function CompanyManagerModal({ visible, company, currentUserId, onClose }: Props) {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setMembers(await loadCompanyMembers());
    } catch (error) {
      Alert.alert(
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

  async function invite() {
    await Share.share({
      title: `Convite para ${company.name}`,
      message:
        `Entre no grupo ${company.name} no aplicativo Prazo Certo.\n\n` +
        `Código da empresa: ${company.inviteCode}`,
    });
  }

  function confirmRemove(member: CompanyMember) {
    Alert.alert(
      "Remover participante",
      `Deseja remover ${member.name} do grupo da empresa?`,
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
              Alert.alert(
                "Não foi possível remover",
                error instanceof Error ? error.message : "Tente novamente.",
              );
            }
          },
        },
      ],
    );
  }

  return (
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
          <Text style={styles.companyLabel}>EMPRESA</Text>
          <Text style={styles.companyName}>{company.name}</Text>
          <Text style={styles.code}>Código: {company.inviteCode}</Text>
          <Pressable style={styles.inviteButton} onPress={invite}>
            <Text style={styles.inviteButtonText}>＋ CONVIDAR FUNCIONÁRIO</Text>
          </Pressable>
          <Text style={styles.inviteHelp}>
            Envie o código. A pessoa entra na conta dela e toca em “Entrar com código”.
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
              <View style={styles.member}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <Text style={styles.memberEmail}>{item.email}</Text>
                  <Text style={styles.role}>{roleLabels[item.role]}</Text>
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
  inviteButton: { height: 49, backgroundColor: "#E5AC4F", borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 17 },
  inviteButtonText: { color: "#173D31", fontSize: 13, fontWeight: "900" },
  inviteHelp: { color: "#CFE0D8", fontSize: 11, lineHeight: 16, marginTop: 10 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, marginTop: 24, marginBottom: 10 },
  listTitle: { color: "#203D33", fontSize: 19, fontWeight: "900" },
  count: { minWidth: 29, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "#DDEEE5", color: "#176844", textAlign: "center", fontWeight: "900" },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 28, gap: 10 },
  empty: { color: "#718077", textAlign: "center", marginTop: 30 },
  member: { minHeight: 84, backgroundColor: "#FFF", borderRadius: 17, padding: 13, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#E3E9E4" },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#DDEEE5", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#174D3B", fontSize: 20, fontWeight: "900" },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberName: { color: "#203D33", fontSize: 15, fontWeight: "800" },
  memberEmail: { color: "#7B8781", fontSize: 11, marginTop: 2 },
  role: { color: "#23845D", fontSize: 10, fontWeight: "800", marginTop: 5 },
  removeButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#F5E5E2" },
  removeText: { color: "#A13A2F", fontSize: 10, fontWeight: "900" },
});
