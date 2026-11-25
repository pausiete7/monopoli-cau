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

// ---------- Galeria de cares (només en aquest navegador, a IndexedDB) ----------
// Les cares surten a l'atzar com d'una baralla: no se'n repeteix cap fins que han sortit totes.
let faces = [];
let bag = [];
const openDb = () => new Promise((res, rej) => {
  const r = indexedDB.open('caupoli-cares', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('f');
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});

export async function loadFaces() {
  try {
    const db = await openDb();
    faces = await new Promise((res) => {
      const q = db.transaction('f').objectStore('f').get('all');
      q.onsuccess = () => res(Array.isArray(q.result) ? q.result : []);
      q.onerror = () => res([]);
    });
  } catch { faces = []; }
  bag = [];
  return faces.length;
}

export async function saveFaces(list) {
  faces = list;
  bag = [];
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction('f', 'readwrite');
      tx.objectStore('f').put(list, 'all');
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}

export const faceList = () => faces;

export function randomFace() {
  if (!faces.length) return '';
  if (!bag.length) {
    bag = faces.map((_, k) => k);
    for (let k = bag.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [bag[k], bag[j]] = [bag[j], bag[k]]; }
  }
  return faces[bag.pop()];
}

// reparteix una cara diferent a cada equip i a cada bitllet del pot
export function dealFaces(teamIds) {
  if (!faces.length) return;
  [...teamIds, 'bill1', 'bill2', 'bill3'].forEach((id) => setPhoto(id, randomFace()));
}

export const initials =(n) => String(n || '').replace(/^Equip\s+/i, '').trim().slice(0, 2).toUpperCase() || '?';

export function avatarStyle(t) {
  const p = photoOf(t.id);
  return `--tc:${t.color};${p ? `background-image:url(${p});` : ''}`;
}
export const avatarText = (t) => (photoOf(t.id) ? '' : esc(initials(t.name)));
