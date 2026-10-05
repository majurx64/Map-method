export function chooseHistoryEntry(entries, selection) {
  return entries.find(({ version }) => version.id === selection.id)
    || entries.find(({ index }) => index === selection.index)
    || entries.at(-1) || null;
}

export function removeHistoryVersion(map, versionId) {
  const version = map.versions.find((item) => item.id === versionId);
  if (!version || (map.collaboration && !version.eventId)) return map;
  return { ...map, versions: map.versions.filter((item) => item.id !== versionId),
    ...(map.collaboration && { collaboration: { ...map.collaboration,
      events: (map.collaboration.events || []).map((event) => String(event.id) === String(version.eventId) ? { ...event, version_hidden: true } : event),
    } }),
  };
}

export function restoreHistoryVersion(map, deleted) {
  const versions = [...map.versions];
  if (!versions.some((version) => version.id === deleted.version.id)) {
    const next = versions.findIndex((version) => version.id === deleted.nextId);
    const previous = versions.findIndex((version) => version.id === deleted.previousId);
    const index = next >= 0 ? next : previous >= 0 ? previous + 1 : Math.min(deleted.index, versions.length);
    versions.splice(index, 0, deleted.version);
  }
  return { ...map, versions,
    ...(map.collaboration && { collaboration: { ...map.collaboration,
      events: (map.collaboration.events || []).map((event) => String(event.id) === String(deleted.version.eventId) ? { ...event, version_hidden: false } : event),
    } }),
  };
}

export function animateHistoryRemoval(row, reducedMotion = false) {
  if (!row?.animate || reducedMotion) return { finished: Promise.resolve(), rollback: async () => {}, cancel: () => {} };
  const animation = row.animate([
    { height: row.getBoundingClientRect().height + 'px', marginBottom: '0px', borderWidth: '1px', opacity: 1, transform: 'translateX(0)' },
    { height: '0px', marginBottom: '-6px', borderWidth: '0px', opacity: 0, transform: 'translateX(10px)' },
  ], { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  return {
    finished: animation.finished.catch(() => {}),
    cancel: () => animation.cancel(),
    rollback: async () => {
      if (row.isConnected === false) { animation.cancel(); return; }
      animation.reverse();
      await animation.finished.catch(() => {});
      animation.cancel();
    },
  };
}
