// Offsets are in document coordinates; the pointer stays in viewport coordinates.
export function cardDragPosition(start, pointer, scroll) {
  return {
    dx: pointer.x - start.x + scroll.x - start.scrollX,
    dy: pointer.y - start.y + scroll.y - start.scrollY,
  };
}

export function cardDropIndex(pointer, slots) {
  let best = 0;
  let distance = Infinity;
  slots.forEach((slot, index) => {
    const dx = Math.max(slot.left - pointer.x, 0, pointer.x - slot.left - slot.width);
    const dy = Math.max(slot.top - pointer.y, 0, pointer.y - slot.top - slot.height);
    const next = dx * dx + dy * dy;
    if (next < distance) { distance = next; best = index; }
  });
  return best;
}
