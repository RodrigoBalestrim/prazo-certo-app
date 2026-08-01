import { supabase } from "./supabase";

export type CompanyRole = "owner" | "admin" | "member";

export type CompanyMembership = {
  id: string;
  name: string;
  inviteCode: string;
  role: CompanyRole;
};

export type CompanyMember = {
  userId: string;
  name: string;
  email: string;
  role: CompanyRole;
  joinedAt: string;
};

export async function loadMyCompany(): Promise<CompanyMembership | null> {
  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) return null;

  const { data: company, error: companyError } = await supabase
    .from("organizations")
    .select("id, name, invite_code")
    .eq("id", membership.organization_id)
    .single();
  if (companyError) throw companyError;

  return {
    id: company.id,
    name: company.name,
    inviteCode: company.invite_code,
    role: membership.role as CompanyRole,
  };
}

export async function createCompany(name: string): Promise<void> {
  const { error } = await supabase.rpc("create_company", {
    company_name: name.trim(),
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
  }) => ({
    userId: member.user_id,
    name: member.display_name || member.email.split("@")[0],
    email: member.email,
    role: member.role,
    joinedAt: member.joined_at,
  }));
}

export async function removeCompanyMember(userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_company_member", {
    member_user_id: userId,
  });
  if (error) throw error;
}
