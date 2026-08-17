/**
 * Auditoria de operações de produto.
 *
 * O app registra ações explícitas (create/update/delete/config) pela RPC
 * insert_audit_log; o banco também grava automaticamente alterações via
 * trigger. O histórico alimenta a tela de Histórico e é a trilha de
 * responsabilidade para listas de grupo (quem mudou o quê e quando).
 * Auditoria é sempre best-effort: nunca deve bloquear o fluxo do usuário.
 */
import { supabase } from "./supabase";

export type AuditAction = "create" | "update" | "delete" | "config_change";

export type AuditEntry = {
  action: AuditAction;
  productId?: string;
  productName?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
};

// Registra uma ação no histórico de auditoria (item 9 do plano de melhorias).
// As alterações de produto também são gravadas automaticamente por trigger no banco.
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await supabase.rpc("insert_audit_log", {
      p_action: entry.action,
      p_product_id: entry.productId ?? null,
      p_product_name: entry.productName ?? null,
      p_field_name: entry.field ?? null,
      p_old_value: entry.oldValue ?? null,
      p_new_value: entry.newValue ?? null,
    });
    if (error) throw error;
  } catch {
    // Auditoria é best-effort: nunca bloqueia o fluxo do usuário.
  }
}

// Consulta o histórico de auditoria visível para o usuário/equipe.
export async function loadAuditLogs(limit = 100): Promise<Array<{
  id: string;
  action: AuditAction;
  productName: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}>> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, product_name, field_name, old_value, new_value, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: {
    id: string;
    action: AuditAction;
    product_name: string | null;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }) => ({
    id: row.id,
    action: row.action,
    productName: row.product_name,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
  }));
}
