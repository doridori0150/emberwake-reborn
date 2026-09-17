/* 버전 있는 로컬 저장소. IndexedDB 'emberwake-reborn-db' (원본 Emberwake 와 DB·키가 다르다).
   - 한 트랜잭션 안에서 현재 기록을 읽고 rev/세션을 확인한 뒤 쓰므로 탭 충돌로 진행이 덮이지 않는다.
   - 체크섬으로 손상을 감지하고, 새 게임·가져오기·복원 전에 자동 백업을 만든다.
   - pack/unpack/migrate 는 순수 함수라 Node 테스트에서 검증한다. */
(function (g) {
  'use strict';
  const ER = g.ER = g.ER || {};
  const APP = 'emberwake-reborn', SAVE_VERSION = 1, DB = 'emberwake-reborn-db', STORE = 'saves', MAX_BACKUPS = 6;
  const sum = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };

  function pack(state) { const data = JSON.stringify(state); return { app: APP, saveVersion: SAVE_VERSION, savedAt: new Date().toISOString(), checksum: sum(data), data }; }
  function migrate(state, from) { if (from > SAVE_VERSION) throw new Error('더 새로운 버전의 저장 파일입니다.'); /* v1 → 이후 버전 이전 단계는 여기에 추가 */ return state; }
  function unpack(rec) {
    if (!rec || typeof rec !== 'object') throw new Error('저장 기록이 아닙니다.');
    if (rec.app !== APP) throw new Error('다른 게임의 저장 파일입니다.');
    if (rec.broken) throw new Error('저장 기록을 읽을 수 없습니다(구문 오류).');
    if (typeof rec.data !== 'string' || sum(rec.data) !== rec.checksum) throw new Error('저장 파일이 손상되었습니다(체크섬 불일치).');
    let state; try { state = JSON.parse(rec.data); } catch { throw new Error('저장 파일이 손상되었습니다(구문 오류).'); }
    const G = state?.guild; if (!state || !state.meta || !G || typeof G.facilities !== 'object' || typeof G.heroes !== 'object' || !Array.isArray(G.roster) || !G.roster.length || typeof G.regions !== 'object' || !G.selected) throw new Error('저장 파일 구조가 올바르지 않습니다.');
    return migrate(state, rec.saveVersion);
  }

  const session = Math.random().toString(36).slice(2) + Date.now().toString(36);
  let dbp = null, knownRev = 0, mode = 'idb';
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => { if (!g.indexedDB) return rej(new Error('IndexedDB 없음')); const rq = g.indexedDB.open(DB, 1); rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'key' }); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('저장소가 다른 탭에 막혀 있습니다.')); })
      .catch(err => { mode = 'local'; console.warn('IndexedDB 사용 불가, localStorage 로 대체:', err); return null; });
    return dbp;
  }
  function tx(db, rw, fn) { return new Promise((res, rej) => { const t = db.transaction(STORE, rw ? 'readwrite' : 'readonly'), st = t.objectStore(STORE); let out; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('저장 취소')); fn(st, v => { out = v; }, t); }); }
  const lsKey = k => APP + ':' + k;

  async function getRec(key) { const db = await open(); if (!db) { const s = g.localStorage?.getItem(lsKey(key)); if (!s) return null; try { return JSON.parse(s); } catch { return { app: APP, broken: true }; } } return tx(db, false, (st, set) => { const r = st.get(key); r.onsuccess = () => set(r.result || null); }); }
  async function load() { const rec = await getRec('current'); if (!rec) return { state: null }; try { const state = unpack(rec); knownRev = rec.rev || 0; return { state }; } catch (e) { return { state: null, error: e.message }; } }

  // 저장: 다른 세션이 더 새 기록을 썼다면 거부한다(force 로만 덮어쓴다).
  async function save(state, force) {
    const rec = Object.assign(pack(state), { key: 'current', session, rev: knownRev + 1 }); const db = await open();
    if (!db) { try { let cur = null; try { cur = JSON.parse(g.localStorage.getItem(lsKey('current')) || 'null'); } catch { cur = null; } if (!force && cur && cur.session !== session && (cur.rev || 0) >= rec.rev) return { ok: false, conflict: true, reason: '다른 탭에서 더 새로운 진행이 저장되었습니다.' }; g.localStorage.setItem(lsKey('current'), JSON.stringify(rec)); knownRev = rec.rev; return { ok: true }; } catch (e) { return { ok: false, reason: '저장 실패: ' + e.message }; } }
    try {
      const r = await tx(db, true, (st, set, t) => { const q = st.get('current'); q.onsuccess = () => { const cur = q.result; if (!force && cur && cur.session !== session && (cur.rev || 0) >= rec.rev) { set({ ok: false, conflict: true, reason: '다른 탭에서 더 새로운 진행이 저장되었습니다.' }); return; } if (force && cur) rec.rev = Math.max(rec.rev, (cur.rev || 0) + 1); st.put(rec); set({ ok: true }); }; });
      if (r.ok) knownRev = rec.rev; return r;
    } catch (e) { return { ok: false, reason: '저장 실패: ' + (e?.message || e) }; }
  }
  async function backup(label) {
    const cur = await getRec('current'); if (!cur) return null; const key = 'backup:' + Date.now() + ':' + label, db = await open(), copy = Object.assign({}, cur, { key, label, backedUpAt: new Date().toISOString() });
    if (!db) { g.localStorage.setItem(lsKey(key), JSON.stringify(copy)); return key; }
    await tx(db, true, st => { st.put(copy); const all = st.getAllKeys(); all.onsuccess = () => { const keys = all.result.filter(k => String(k).startsWith('backup:')).sort(); while (keys.length > MAX_BACKUPS) st.delete(keys.shift()); }; }); return key;
  }
  async function listBackups() { const db = await open(); let recs = []; if (!db) { for (let i = 0; i < g.localStorage.length; i++) { const k = g.localStorage.key(i); if (k.startsWith(lsKey('backup:'))) recs.push(JSON.parse(g.localStorage.getItem(k))); } } else recs = await tx(db, false, (st, set) => { const r = st.getAll(); r.onsuccess = () => set(r.result.filter(x => String(x.key).startsWith('backup:'))); }); return recs.sort((a, b) => (a.key < b.key ? 1 : -1)).map(r => { let info = ''; try { const s = unpack(r); info = '금화 ' + s.guild.gold + ' · 원정 ' + s.guild.stats.runs + '회'; } catch { info = '손상됨'; } return { key: r.key, label: r.label, at: r.backedUpAt, info }; }); }
  async function restore(key) { const rec = await getRec(key); const state = unpack(rec); await backup('복원 전 자동 백업'); const r = await save(state, true); return r.ok ? { ok: true, state } : r; }
  async function replaceWith(state, label) { await backup(label); return save(state, true); }
  function exportText(state) { const p = pack(state); return JSON.stringify(p, null, 0); }
  function importText(text) { let rec; try { rec = JSON.parse(text); } catch { throw new Error('JSON 파일이 아닙니다.'); } return unpack(rec); }

  ER.save = { APP, SAVE_VERSION, DB, pack, unpack, migrate, checksum: sum, load, save, backup, listBackups, restore, replaceWith, exportText, importText, mode: () => mode, session };
  if (typeof module === 'object') module.exports = ER;
})(typeof globalThis !== 'undefined' ? globalThis : this);
