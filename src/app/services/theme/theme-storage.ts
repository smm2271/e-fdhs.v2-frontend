import { inject, Injectable, InjectionToken } from '@angular/core';
import { ThemeState } from './theme.types';

export abstract class ThemeStorage {
  abstract read(): Promise<ThemeState | null>;
  abstract write(state: ThemeState): Promise<void>;
}
export const IDB_FACTORY = new InjectionToken<IDBFactory | undefined>('Theme IndexedDB factory', {
  providedIn: 'root', factory: () => { try { return globalThis.indexedDB; } catch { return undefined; } },
});

@Injectable({ providedIn: 'root' })
export class IndexedDbThemeStorage extends ThemeStorage {
  private readonly factory = inject(IDB_FACTORY);
  private async database(): Promise<IDBDatabase> {
    if (!this.factory) throw new Error('瀏覽器無法使用 IndexedDB。');
    const factory = this.factory;
    return new Promise((resolve, reject) => {
      const request = factory.open('campus-themes-v1', 1);
      let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error('主題儲存逾時。')); }, 2500);
      const fail = () => { clearTimeout(timer); settled = true; reject(new Error('無法開啟主題儲存。')); };
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state'); };
      request.onblocked = fail; request.onerror = fail;
      request.onsuccess = () => {
        clearTimeout(timer);
        if (settled) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close(); resolve(request.result);
      };
    });
  }
  private async transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('state', mode);
      let request: IDBRequest<T>;
      try { request = operation(transaction.objectStore('state')); }
      catch (error) { db.close(); reject(error); return; }
      const timer = setTimeout(() => { transaction.abort(); }, 2500);
      transaction.oncomplete = () => { clearTimeout(timer); db.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { clearTimeout(timer); db.close(); reject(new Error('主題儲存失敗，可能空間不足或已停用。')); };
    });
  }
  async read(): Promise<ThemeState | null> { return (await this.transaction('readonly', store => store.get('current'))) ?? null; }
  async write(state: ThemeState): Promise<void> { await this.transaction('readwrite', store => store.put(state, 'current')); }
}

export const THEME_STORAGE = new InjectionToken<ThemeStorage>('ThemeStorage', { providedIn: 'root', factory: () => inject(IndexedDbThemeStorage) });
