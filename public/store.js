export class TravelStore {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('worldpick', 1);
      let expired = false;
      const timeout = setTimeout(() => { expired = true; reject(new Error('브라우저 저장소 응답이 지연됩니다. 다른 Worldpick 탭을 닫고 다시 시도해 주세요.')); }, 8000);
      request.onupgradeneeded = () => request.result.createObjectStore('draws', { keyPath: 'id' });
      request.onsuccess = () => { clearTimeout(timeout); if (expired) { request.result.close(); return; } this.db = request.result; resolve(request.result); };
      request.onerror = () => { clearTimeout(timeout); reject(request.error); };
      request.onblocked = () => { clearTimeout(timeout); expired = true; reject(new Error('다른 Worldpick 탭을 닫고 다시 시도해 주세요.')); };
    });
    this.db.onversionchange = () => this.db.close();
    return this;
  }

  all() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('draws', 'readonly');
      const request = tx.objectStore('draws').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('기록을 읽을 수 없어요.'));
      tx.onerror = () => {};
    });
  }

  // A read/write transaction serializes claims across tabs. add() cannot overwrite a prior draw.
  claim(city) {
    return new Promise((resolve, reject) => {
      let claimed = false;
      const tx = this.db.transaction('draws', 'readwrite');
      const store = tx.objectStore('draws');
      const get = store.get(city[0]);
      get.onsuccess = () => {
        if (get.result) return;
        store.add({ id: city[0], city, time: Date.now() });
        claimed = true;
      };
      tx.oncomplete = () => resolve(claimed);
      tx.onabort = () => reject(tx.error || new Error('여행 기록을 저장하지 못했어요.'));
      tx.onerror = () => {};
    });
  }
}

// Rejection sampling avoids modulo bias. Every remaining city has equal probability.
export function randomIndex(length) {
  if (!Number.isInteger(length) || length <= 0 || length > 2 ** 32) throw new RangeError('Invalid pool size');
  const value = new Uint32Array(1);
  const limit = Math.floor(2 ** 32 / length) * length;
  do { crypto.getRandomValues(value); } while (value[0] >= limit);
  return value[0] % length;
}
