import type { SupabaseClient } from '@supabase/supabase-js';
import {
  StoreAdapterRepository,
  SupabaseRepository,
  type DataRepository,
  type LocalStoreFile,
} from './shared';

const BROWSER_STORAGE_KEY = 'barflow_browser_db_v1';

export class BrowserLocalRepository extends StoreAdapterRepository {
  constructor(storageKey = BROWSER_STORAGE_KEY) {
    super('browser-local', {
      load() {
        try {
          const raw = window.localStorage.getItem(storageKey);
          if (!raw) return null;
          return JSON.parse(raw) as Partial<LocalStoreFile>;
        } catch {
          return null;
        }
      },
      save(state: LocalStoreFile) {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(state));
        } catch (err) {
          console.error('Error guardando estado local en navegador:', err);
        }
      },
    });
  }
}

export function createSupabaseBrowserRepository(client: SupabaseClient): DataRepository {
  return new SupabaseRepository(client);
}
