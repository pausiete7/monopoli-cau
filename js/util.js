// Utilitats compartides: escapar text i fotos dels equips (només en aquest navegador).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const photoCache = {};
const listeners = new Set();
export const onPhotoChange = (fn) => listeners.add(fn);

export function photoOf(id) {
  if (!(id in photoCache)) {
    try { photoCache[id] = localStorage.getItem(`monopoli-cau-photo-${id}`) || ''; } catch { photoCache[id] = ''; }
  }
  return photoCache[id];
}

export function setPhoto(id, dataUrl) {
  photoCache[id] = dataUrl || '';
  let ok = true;
  try {
    if (dataUrl) localStorage.setItem(`monopoli-cau-photo-${id}`, dataUrl);
    else localStorage.removeItem(`monopoli-cau-photo-${id}`);
  } catch { ok = false; }
  listeners.forEach((fn) => fn(id));
  return ok;
}

export const initials = (n) => String(n || '').replace(/^Equip\s+/i, '').trim().slice(0, 2).toUpperCase() || '?';

export function avatarStyle(t) {
  const p = photoOf(t.id);
  return `--tc:${t.color};${p ? `background-image:url(${p});` : ''}`;
}
export const avatarText = (t) => (photoOf(t.id) ? '' : esc(initials(t.name)));
