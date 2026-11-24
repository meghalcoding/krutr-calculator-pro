/* KRUTr Stage 4 persistence: IndexedDB with a localStorage fallback. */
"use strict";
(() => {
  const DB_NAME = "KRUTrCalculatorPro";
  const DB_VERSION = 1;
  const FALLBACK_KEY = "krutr-stage4-data-v1";
  let dbPromise;
  let fallbackMode = false;

  function fallbackRead() {
    try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{"presets":[],"calculations":[]}'); }
    catch { return { presets: [], calculations: [] }; }
  }
  function fallbackWrite(data) { localStorage.setItem(FALLBACK_KEY, JSON.stringify(data)); }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) { fallbackMode = true; resolve(null); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("presets")) db.createObjectStore("presets", { keyPath: "id" });
        if (!db.objectStoreNames.contains("calculations")) {
          const store = db.createObjectStore("calculations", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { fallbackMode = true; resolve(null); };
      request.onblocked = () => { fallbackMode = true; resolve(null); };
    });
    return dbPromise;
  }

  async function request(storeName, mode, action) {
    const db = await openDb();
    if (!db) {
      const data = fallbackRead();
      const result = action(data[storeName]);
      if (mode !== "readonly") fallbackWrite(data);
      return result;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let output;
      try { output = action(store, resolve, reject); }
      catch (error) { reject(error); }
      tx.oncomplete = () => { if (output !== undefined) resolve(output); };
      tx.onerror = () => reject(tx.error || new Error("Storage transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Storage transaction aborted."));
    });
  }

  async function all(storeName) {
    const db = await openDb();
    if (!db) return fallbackRead()[storeName].slice();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function put(storeName, record) {
    const db = await openDb();
    if (!db) {
      const data = fallbackRead();
      const i = data[storeName].findIndex(x => x.id === record.id);
      if (i < 0) data[storeName].push(record); else data[storeName][i] = record;
      fallbackWrite(data); return record;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function remove(storeName, id) {
    const db = await openDb();
    if (!db) {
      const data = fallbackRead(); data[storeName] = data[storeName].filter(x => x.id !== id); fallbackWrite(data); return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).delete(id);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  async function clear(storeName) {
    const db = await openDb();
    if (!db) { const data = fallbackRead(); data[storeName] = []; fallbackWrite(data); return; }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).clear();
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }
  window.KRUTrStorage = {
    all, put, remove, clear,
    get mode() { return fallbackMode ? "localStorage fallback" : "IndexedDB"; }
  };
})();