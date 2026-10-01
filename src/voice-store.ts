const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("call-for-me-voice", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("notes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
export async function saveVoice(blob: Blob, duration: number) {
  const db = await database();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("notes", "readwrite");
      tx.objectStore("notes").put({ blob, duration }, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return id;
  } finally {
    db.close();
  }
}
export async function readVoice(
  id: string,
): Promise<{ blob: Blob; duration: number } | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("notes");
      const r = tx.objectStore("notes").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
