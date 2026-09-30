export function stableDrawingColors(completed, colors = [], fallback = '#111111') {
  const next = colors.slice();
  for (const index of completed) if (!next[index]) next[index] = fallback;
  return next;
}

export function hsvToHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return '#' + [r,g,b].map(n => Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}

export function hexToHsv(hex) {
  const [r,g,b] = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=d===0 ? 0 : max===r ? 60*((g-b)/d%6) : max===g ? 60*((b-r)/d+2) : 60*((r-g)/d+4);
  if(h<0) h+=360;
  return { h, s:max===0 ? 0 : d/max, v:max };
}
