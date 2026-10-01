import { supabase } from './supabase';
import { collaborativeVersions } from './collaborativeHistory.js';
import { stableDrawingColors } from './drawingColors.js';

export const INVITE_KEY = 'mm-collaborative-invite';
export const JOIN_KEY = 'mm-collaborative-join';

export function rememberCollaborativeInvite() {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('collaborate') || new URLSearchParams(url.hash.slice(1)).get('collaborate');
  if (token && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(token)) localStorage.setItem(INVITE_KEY, token);
  return localStorage.getItem(INVITE_KEY) || '';
}

export function collaborativeMap(data) {
  const map = { ...data.map_data, colors: data.map_data.mapType === 'image' ? data.map_data.colors || [] : stableDrawingColors(data.map_data.completed || [], data.map_data.colors || [], data.map_data.drawColor || '#111111') };
  const team = {
    id: data.id, ownerId: data.owner_id, inviteToken: data.invite_token,
    members: data.members || [], claims: data.claims || {}, events: data.events || [],
    revision: data.revision, baseProgress: data.map_data.progressCompleted || [],
    hidden: Boolean(data.hidden),
    baseDrawing: { completed: map.completed || [], colors: map.colors },
  };
  return { ...map, isGameMode: true, versions: collaborativeVersions(map, team), collaboration: team };
}

export function drawingChanges(before, after) {
  const old = new Set(before.completed), next = new Set(after.completed);
  return [...new Set([...old, ...next])].filter((i) => old.has(i) !== next.has(i) || (next.has(i) && before.colors[i] !== after.colors[i]))
    .map((index) => ({ index, filled: next.has(index), mode: 'drawing', color: after.colors[index] || '#111111' }));
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
  return [...merged.values()].filter((map) => !map.collaboration?.hidden);
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
