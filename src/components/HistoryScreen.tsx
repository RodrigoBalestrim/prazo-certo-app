/**
 * Tela de histórico de produtos (arquivados/vencidos).
 *
 * Filtros por texto, setor e período. A exclusão definitiva é controlada por
 * canDelete (papel admin/owner — RLS também valida no banco).
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { formatBrazilianDate, parseBrazilianDate } from "../date";
import { PRODUCT_CATEGORIES, Product } from "../types";
import { AppAlert, AlertButton, AlertMessage } from "./AppAlert";

type Props = {
  visible: boolean;
  load: () => Promise<Product[]>;
  canDelete: boolean;
  onDelete: (product: Product) => Promise<void>;
  onClose: () => void;
};

export function HistoryScreen({ visible, load, canDelete, onDelete, onClose }: Props) {
  const [alert, setAlert] = useState<AlertMessage | null>(null);

  function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
    setAlert({ title, message, buttons });
  }
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setItems(await load());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (visible) {
      setSearch("");
      setSector(null);
      setPeriodStart("");
      setPeriodEnd("");
      refresh();
    }
  }, [visible]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const start = parseBrazilianDate(periodStart);
    const end = parseBrazilianDate(periodEnd);
    return items.filter((item) => {
      if (term && !item.name.toLowerCase().includes(term)) return false;
      if (sector && (item.category || "Mercearia") !== sector) return false;
      const itemDate = new Date(`${item.expiresAt}T12:00:00`);
      if (start && itemDate < start) return false;
      if (end) {
        const endDay = new Date(end);
        endDay.setHours(23, 59, 59, 999);
        if (itemDate > endDay) return false;
      }
      return true;
    });
  }, [items, search, sector, periodStart, periodEnd]);

  function confirmDelete(product: Product) {
    showAlert(
      "Excluir do histórico",
      `Deseja excluir definitivamente "${product.name}"? Esta ação não pode ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            setDeletingId(product.id);
            try {
              await onDelete(product);
              await refresh();
            } catch (error) {
              showAlert(
                "Não foi possível excluir",
                error instanceof Error ? error.message : "Tente novamente.",
              );
            } finally {
              setDeletingId(null);
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
          <Text style={styles.title}>HISTÓRICO</Text>
          <View style={styles.headerSpace} />
        </View>

        <View style={styles.filterCard}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Pesquisar por nome do item"
            autoCapitalize="none"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectorRow}
          >
            {PRODUCT_CATEGORIES.map((option) => {
              const active = sector === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.sectorChip, active && styles.sectorChipActive]}
                  onPress={() => setSector(active ? null : option)}
                >
                  <Text style={[styles.sectorChipText, active && styles.sectorChipTextActive]}>{option}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.periodRow}>
            <TextInput
              style={styles.periodInput}
              value={periodStart}
              onChangeText={(value) => setPeriodStart(maskDate(value))}
              placeholder="Validade de (DD/MM/AAAA)"
              keyboardType="number-pad"
              maxLength={10}
            />
            <TextInput
              style={styles.periodInput}
              value={periodEnd}
              onChangeText={(value) => setPeriodEnd(maskDate(value))}
              placeholder="Validade até (DD/MM/AAAA)"
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Itens arquivados</Text>
          <Text style={styles.count}>{filtered.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator color="#23845D" style={styles.loading} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {items.length
                  ? "Nenhum item encontrado com esses filtros."
                  : "Nenhum item no histórico ainda. Itens vencidos há mais de 4 dias aparecem aqui."}
              </Text>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.cardBody}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>Qtd: {item.quantity}</Text>
                    <Text style={styles.meta}>Validade: {formatBrazilianDate(item.expiresAt)}</Text>
                    <Text style={styles.meta}>Setor: {item.category || "Mercearia"}</Text>
                  </View>
                  {item.archivedAt ? (
                    <Text style={styles.archivedDate}>Arquivado em {formatBrazilianDate(item.archivedAt.slice(0, 10))}</Text>
                  ) : null}
                  {item.notes ? <Text style={styles.notes}>Obs.: {item.notes}</Text> : null}
                </View>
                {canDelete ? (
                  <Pressable
                    style={styles.deleteButton}
                    disabled={deletingId === item.id}
                    onPress={() => confirmDelete(item)}
                  >
                    {deletingId === item.id ? (
                      <ActivityIndicator size="small" color="#A13A2F" />
                    ) : (
                      <Text style={styles.deleteText}>Excluir</Text>
                    )}
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

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F6F2", paddingTop: 38 },
  header: { minHeight: 58, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backButton: { width: 76, minHeight: 40, justifyContent: "center" },
  backText: { color: "#176844", fontSize: 14, fontWeight: "800" },
  title: { color: "#173D31", fontSize: 16, fontWeight: "900" },
  headerSpace: { width: 76 },
  filterCard: { marginHorizontal: 20, backgroundColor: "#FFF", borderRadius: 18, padding: 13, gap: 10 },
  searchInput: { height: 46, borderWidth: 1, borderColor: "#D8E0DA", borderRadius: 12, paddingHorizontal: 13, fontSize: 14, color: "#243D34" },
  sectorRow: { gap: 7, paddingVertical: 2 },
  sectorChip: { paddingHorizontal: 12, height: 34, borderRadius: 11, borderWidth: 1, borderColor: "#D5DDD7", backgroundColor: "#FFF", alignItems: "center", justifyContent: "center" },
  sectorChipActive: { backgroundColor: "#1E7A55", borderColor: "#1E7A55" },
  sectorChipText: { color: "#5E6C65", fontSize: 11, fontWeight: "700" },
  sectorChipTextActive: { color: "#FFF" },
  periodRow: { flexDirection: "row", gap: 9 },
  periodInput: { flex: 1, height: 44, borderWidth: 1, borderColor: "#D8E0DA", borderRadius: 12, paddingHorizontal: 12, fontSize: 13, color: "#243D34" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22, marginTop: 18, marginBottom: 10 },
  listTitle: { color: "#203D33", fontSize: 17, fontWeight: "900" },
  count: { minWidth: 29, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "#DDEEE5", color: "#176844", textAlign: "center", fontWeight: "900" },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 30, gap: 10 },
  empty: { color: "#718077", textAlign: "center", marginTop: 30, paddingHorizontal: 30, lineHeight: 20 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#E3E9E4", flexDirection: "row", alignItems: "center" },
  cardBody: { flex: 1 },
  itemName: { color: "#203D33", fontSize: 15, fontWeight: "800" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  meta: { color: "#6C7C73", fontSize: 11, fontWeight: "600" },
  archivedDate: { color: "#A1752C", fontSize: 10, marginTop: 5, fontWeight: "700" },
  notes: { color: "#5E6C65", fontSize: 11, marginTop: 5 },
  deleteButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "#F5E5E2", marginLeft: 10 },
  deleteText: { color: "#A13A2F", fontSize: 11, fontWeight: "900" },
});
