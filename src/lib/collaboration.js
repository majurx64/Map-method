import { supabase } from './supabase';

export const INVITE_KEY = 'mm-collaborative-invite';
export const JOIN_KEY = 'mm-collaborative-join';

export function collaborativeMap(data) {
  return { ...data.map_data, isGameMode: true, versions: [], collaboration: {
    id: data.id, ownerId: data.owner_id, inviteToken: data.invite_token,
    members: data.members || [], claims: data.claims || {}, events: data.events || [],
    revision: data.revision, baseProgress: data.map_data.progressCompleted || [],
  } };
}

export function progressChanges(before, after) {
  const old = new Set(before), next = new Set(after);
  return [...new Set([...old, ...next])].filter((index) => old.has(index) !== next.has(index))
    .map((index) => ({ index, filled: next.has(index) }));
}

export async function collaborativeRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadCollaborativeMaps() {
  return (await collaborativeRpc('list_collaborative_maps') || []).map(collaborativeMap);
}

export function mergeCollaborativeMaps(maps, shared) {
  const merged = new Map(maps.map((map) => [map.id, map]));
  shared.forEach((map) => merged.set(map.id, map));
  return [...merged.values()];
}

export function participantName(user) {
  return user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.username || user?.email?.split('@')[0] || 'Участник';
}

export function contributionStats(team) {
  const counts = Object.values(team.claims).reduce((result, id) => ({ ...result, [id]: (result[id] || 0) + 1 }), {});
  const total = Object.keys(team.claims).length;
  return team.members.map((member) => ({ ...member, cells: counts[member.id] || 0,
    percent: total ? (counts[member.id] || 0) / total * 100 : 0 }));
}
