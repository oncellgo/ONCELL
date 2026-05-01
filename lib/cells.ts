import { db } from './db';
import { generateCellId, generateInviteToken } from './invite';

export type CellMode = 'qt' | 'reading' | 'memorize';

export type EnabledModes = {
  qt?: boolean;
  reading?: boolean;
  memorize?: boolean;
};

export type CellRow = {
  id: string;
  name: string;
  owner_profile_id: string;
  community_id: string | null;
  approval_mode: 'auto' | 'manual';
  invite_token: string;
  bundle_community_join: boolean;
  enabled_modes: EnabledModes;
  qt_settings: Record<string, unknown> | null;
  reading_settings: Record<string, unknown> | null;
  memorize_settings: Record<string, unknown> | null;
  description: string | null;
  invite_message: string | null;
  member_count: number;
  created_at: string;
  archived_at: string | null;
};

export type CreateCellInput = {
  name: string;
  ownerProfileId: string;
  communityId?: string | null;
  approvalMode?: 'auto' | 'manual';
  enabledModes: EnabledModes;
  description?: string;
  inviteMessage?: string;
  qtSettings?: Record<string, unknown>;
  readingSettings?: Record<string, unknown>;
  memorizeSettings?: Record<string, unknown>;
};

export async function createCell(input: CreateCellInput): Promise<CellRow> {
  const id = generateCellId();
  const invite_token = generateInviteToken();
  const row = {
    id,
    name: input.name.trim().slice(0, 80),
    owner_profile_id: input.ownerProfileId,
    community_id: input.communityId || null,
    approval_mode: input.approvalMode || 'auto',
    invite_token,
    bundle_community_join: false,
    enabled_modes: input.enabledModes,
    qt_settings: input.qtSettings || null,
    reading_settings: input.readingSettings || null,
    memorize_settings: input.memorizeSettings || null,
    description: input.description?.trim().slice(0, 1000) || null,
    invite_message: input.inviteMessage?.trim().slice(0, 500) || null,
    member_count: 1,
  };
  const { data, error } = await db.from('oncell_cells').insert(row).select('*').single();
  if (error) throw error;

  // owner 본인을 첫 멤버로 추가
  const { error: memberErr } = await db.from('oncell_cell_members').insert({
    cell_id: id,
    profile_id: input.ownerProfileId,
    status: 'approved',
  });
  if (memberErr) throw memberErr;

  return data as CellRow;
}

export async function getCellById(cellId: string): Promise<CellRow | null> {
  const { data, error } = await db.from('oncell_cells').select('*').eq('id', cellId).maybeSingle();
  if (error) throw error;
  return (data as CellRow | null) || null;
}

export async function getCellByInviteToken(token: string): Promise<CellRow | null> {
  const { data, error } = await db.from('oncell_cells').select('*').eq('invite_token', token).maybeSingle();
  if (error) throw error;
  return (data as CellRow | null) || null;
}

export async function getCellsByOwner(profileId: string): Promise<CellRow[]> {
  const { data, error } = await db
    .from('oncell_cells')
    .select('*')
    .eq('owner_profile_id', profileId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CellRow[];
}

export async function getCellsByMember(profileId: string): Promise<CellRow[]> {
  const { data: memberships, error: mErr } = await db
    .from('oncell_cell_members')
    .select('cell_id')
    .eq('profile_id', profileId)
    .eq('status', 'approved');
  if (mErr) throw mErr;
  const ids = (memberships || []).map((m: any) => m.cell_id);
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from('oncell_cells')
    .select('*')
    .in('id', ids)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CellRow[];
}

export async function countIndependentCellsForUser(profileId: string): Promise<number> {
  // 가입한 독립 셀 수 (owner 포함)
  const cells = await getCellsByMember(profileId);
  return cells.filter((c) => !c.community_id).length;
}

export async function isCellMember(cellId: string, profileId: string): Promise<boolean> {
  const { data, error } = await db
    .from('oncell_cell_members')
    .select('status')
    .eq('cell_id', cellId)
    .eq('profile_id', profileId)
    .eq('status', 'approved')
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
