import fs from 'node:fs';
import path from 'node:path';
import {
  StoreAdapterRepository,
  SupabaseRepository,
  type DataRepository,
  type LocalStoreFile,
} from './shared';

export * from './shared';

export class LocalJsonRepository extends StoreAdapterRepository {
  constructor(filePath = path.join(process.cwd(), 'barflow_local_data.json')) {
    super('local-json', {
      load() {
        if (!fs.existsSync(filePath)) return null;
        try {
          return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LocalStoreFile>;
        } catch {
          return null;
        }
      },
      save(state: LocalStoreFile) {
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
      },
    });
  }
}

export function createRepository(): DataRepository {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  if (url && key && url.startsWith('https://')) {
    return new SupabaseRepository(url, key);
  }
  return new LocalJsonRepository();
}
