// Clear only Worldpick's draw records, preserving other site/browser data.
// Resolve after the transaction commits, so a failed reset leaves the UI intact.
export function clearHistory(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('draws', 'readwrite');
    tx.objectStore('draws').clear();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('여행 기록을 초기화하지 못했어요.'));
    tx.onerror = () => {};
  });
}
