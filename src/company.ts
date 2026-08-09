import { supabase } from "./supabase";

export type CompanyRole = "owner" | "admin" | "manager" | "stockist" | "viewer";

export type CompanyMembership = {
  id: string;
  name: string;
  companyName?: string;
  sector?: string;
  logoUrl?: string;
  inviteCode: string;
  role: CompanyRole;
};

export type CompanyMember = {
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  joinedAt: string;
  active: boolean;
};

export const COMPANY_ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  manager: "Gerente",
  stockist: "Estoquista",
  viewer: "Visualizador",
};

export const MANAGED_ROLES: CompanyRole[] = ["admin", "manager", "stockist", "viewer"];

// Permissões por nível (item 10 do plano de melhorias)
export function canManageCompany(role: CompanyRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canAddProducts(role: CompanyRole | undefined): boolean {
  return !role || role === "owner" || role === "admin" || role === "manager" || role === "stockist";
}

export function canEditProducts(role: CompanyRole | undefined): boolean {
  return canAddProducts(role);
}

export function canDeleteProducts(role: CompanyRole | undefined): boolean {
  return !role || role === "owner" || role === "admin";
}

export async function loadMyCompany(): Promise<CompanyMembership | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("role, organizations(id, name, company_name, sector, company_logo_url, invite_code)")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;

  const company = (membership as unknown as { organizations: {
    id: string;
    name: string;
    company_name: string | null;
    sector: string | null;
    company_logo_url: string | null;
    invite_code: string;
  } | null }).organizations;
  if (!company) return null;

  return {
    id: company.id,
    name: company.name,
    companyName: company.company_name || company.name,
    sector: company.sector || undefined,
    logoUrl: company.company_logo_url || undefined,
    inviteCode: company.invite_code,
    role: membership.role as CompanyRole,
  };
}

export async function createCompany(
  name: string,
  companyName?: string,
  sector?: string,
  logoUrl?: string,
): Promise<void> {
  const { error } = await supabase.rpc("create_company", {
    company_name: name.trim(),
    business_name: companyName?.trim() || name.trim(),
    company_sector: sector?.trim() || null,
    company_logo_url: logoUrl?.trim() || null,
  });
  if (error) throw error;
}

export async function joinCompany(inviteCode: string): Promise<void> {
  const { error } = await supabase.rpc("join_company", {
    company_code: inviteCode.trim().toUpperCase(),
  });
  if (error) throw error;
}

export async function loadCompanyMembers(): Promise<CompanyMember[]> {
  const { data, error } = await supabase.rpc("list_company_members");
  if (error) throw error;
  return (data ?? []).map((member: {
    user_id: string;
    display_name: string | null;
    email: string;
    role: CompanyRole;
    joined_at: string;
    active: boolean;
  }) => ({
    userId: member.user_id,
    name: member.display_name || member.email.split("@")[0],
    email: member.email,
    role: member.role,
    joinedAt: member.joined_at,
    active: member.active,
  }));
}

export async function removeCompanyMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_company_member", {
    member_user_id: userId,
  });
  if (error) throw error;
}

export async function updateMemberRole(userId: string, role: CompanyRole): Promise<void> {
  const { error } = await supabase.rpc("update_member_role", {
    member_user_id: userId,
    new_role: role,
  });
  if (error) throw error;
}

export async function updateCompany(input: {
  groupName?: string;
  companyName?: string;
  sector?: string;
  logoUrl?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("update_company", {
    p_group_name: input.groupName ?? null,
    p_company_name: input.companyName ?? null,
    p_sector: input.sector ?? null,
    p_logo_url: input.logoUrl ?? null,
  });
  if (error) throw error;
}

export async function removeCompanyLogo(): Promise<void> {
  const { error } = await supabase.rpc("remove_company_logo");
  if (error) throw error;
}

export async function setMemberActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_member_active", {
    member_user_id: userId,
    p_active: active,
  });
  if (error) throw error;
}