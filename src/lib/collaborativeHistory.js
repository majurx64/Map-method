import { getMapStats } from './grid.js';

// Reconstruct exact versions from accepted server deltas, including drawing colours.
export function collaborativeVersions(map, team) {
  const drawing = new Set(map.completed || []), progress = new Set(map.progressCompleted || []);
  const colors = [...(map.colors || [])];
  function apply(change, reverse) {
    const i = change.index;
    const filled = reverse ? (change.previous_filled ?? !change.filled) : change.filled;
    if (change.mode === 'drawing') {
      if (filled) drawing.add(i); else drawing.delete(i);
      colors[i] = reverse ? change.previous_color : change.color;
      if (reverse) { if (change.previous_progress) progress.add(i); else progress.delete(i); }
      else if (!filled) progress.delete(i);
    } else if (filled) progress.add(i); else progress.delete(i);
  }
  [...team.events].reverse().forEach((event) => [...event.changes].reverse().forEach((change) => apply(change, true)));
  function snapshot(event) {
    const state = { ...map, completed: [...drawing], progressCompleted: [...progress], colors: [...colors] };
    const stats = getMapStats(state);
    return { ...state, collaboration: undefined, versions: undefined,
      id: `team-${team.id}-${event?.id || 'initial'}`, eventId: event?.id || null, actorId: event?.actor_id || null,
      createdAt: event?.created_at || map.createdAt || new Date().toISOString(), filled: stats.filled, total: stats.total,
      label: event ? `${team.members.find((member) => member.id === event.actor_id)?.name || 'Участник'} · ${event.kind === 'version' ? 'Сохранённая версия' : event.kind === 'drawing' ? 'Рисование' : 'Изменение'}` : 'Начало совместной работы',
      isGameMode: event?.kind !== 'drawing',
      cellSequence: (event?.changes || []).filter((change) => event.kind === 'drawing' ? change.mode === 'drawing' : change.mode !== 'drawing').map((change) => change.filled ? change.index : -(change.index + 1)),
    };
  }
  const versions = [snapshot(null)];
  team.events.forEach((event) => {
    event.changes.forEach((change) => apply(change, false));
    if (!event.version_hidden) versions.push(snapshot(event));
  });
  return versions;
}
