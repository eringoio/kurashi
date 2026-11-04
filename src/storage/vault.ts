/* 端末の中の保存（SPEC 9.9）。
   - 同意の前は、何もIndexedDBに書かない（メモリの中だけ）。
   - 「残す」のあとは、変えるたびに書く。「残さない」は consent = no の印だけを書く。
   - 見るだけのモードは、保存を読まず、書かない。
   - IndexedDB が使えないときは、メモリの中だけで動く。 */
import { openDB, type IDBPDatabase } from 'idb';

export const STORES = ['settings', 'profile', 'plan', 'items', 'dates', 'objects', 'phrases', 'consent', 'resume', 'meta'] as const;
export type StoreName = (typeof STORES)[number];
/** 人が見て消せるストア（設定の「残している内容」に並べる順） */
export const USER_STORES: StoreName[] = ['profile', 'objects', 'plan', 'items', 'dates', 'phrases', 'resume', 'settings'];

export const DB_NAME = 'kurashi';
export const SCHEMA_VERSION = 1;

/** undecided：まだ聞いていない／kept：残す／not_kept：残さない（または何も残さない）／unavailable：残せない環境／view_only：見るだけ */
export type Mode = 'undecided' | 'kept' | 'not_kept' | 'unavailable' | 'view_only';

type Mem = Map<StoreName, Map<string, unknown>>;
const emptyMem = (): Mem => new Map(STORES.map((s) => [s, new Map()]));

export interface VaultEnv {
  indexedDB?: IDBFactory;
  storage?: Pick<StorageManager, 'persist' | 'persisted'>;
  caches?: Pick<CacheStorage, 'keys' | 'delete'>;
}

export class Vault {
  private db: IDBPDatabase | null = null;
  private mem: Mem = emptyMem();
  private saved: { mem: Mem; mode: Mode } | null = null;
  private listeners = new Set<() => void>();
  mode: Mode = 'undecided';
  /** 「何も残さない」を選んだ。この開いている間は、もう聞かない */
  askedThisSession = false;
  persisted: boolean | null = null;

  private constructor(private env: VaultEnv) {}

  static async open(env: VaultEnv = defaultEnv()): Promise<Vault> {
    const v = new Vault(env);
    try {
      if (!env.indexedDB) throw new Error('no indexedDB');
      v.db = await openDB(DB_NAME, SCHEMA_VERSION, {
        upgrade(db) {
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        },
      });
      const consent = await v.db.get('consent', 'value');
      if (consent === 'yes') {
        v.mode = 'kept';
        await v.loadAll();
        v.persisted = (await env.storage?.persisted?.()) ?? null;
      } else if (consent === 'no') {
        v.mode = 'not_kept';
      }
    } catch {
      v.db = null;
      v.mode = 'unavailable';
    }
    return v;
  }

  subscribe(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  /** 変わるたびに増える番号（画面の描き直しに使う） */
  rev = 0;
  private emit() {
    this.rev++;
    this.listeners.forEach((f) => f());
  }

  get<T = unknown>(store: StoreName, key: string): T | undefined {
    return this.mem.get(store)!.get(key) as T | undefined;
  }
  entries(store: StoreName): [string, unknown][] {
    return [...this.mem.get(store)!.entries()];
  }
  /** 進捗があるか（保存の同意を聞く時点。SPEC 9.9） */
  hasProgress(): boolean {
    return (['profile', 'plan', 'objects', 'phrases', 'items'] as StoreName[]).some((s) => this.mem.get(s)!.size > 0);
  }
  shouldAskConsent(): boolean {
    return this.mode === 'undecided' && !this.askedThisSession && this.hasProgress();
  }

  async put(store: StoreName, key: string, value: unknown) {
    this.mem.get(store)!.set(key, value);
    if (this.mode === 'kept' && this.db) await this.db.put(store, value, key);
    this.emit();
  }
  async del(store: StoreName, key: string) {
    this.mem.get(store)!.delete(key);
    if (this.mode === 'kept' && this.db) await this.db.delete(store, key);
    this.emit();
  }
  async clearStore(store: StoreName) {
    this.mem.get(store)!.clear();
    if (this.mode === 'kept' && this.db) await this.db.clear(store);
    this.emit();
  }

  /** 「残す」：いまメモリにある分を書き、以後は自動で書く。消さないようにブラウザに頼む */
  async keep() {
    if (!this.db || this.mode === 'view_only') return;
    this.mode = 'kept';
    const tx = this.db.transaction([...STORES], 'readwrite');
    for (const s of STORES) for (const [k, val] of this.mem.get(s)!) await tx.objectStore(s).put(val, k);
    await tx.objectStore('consent').put('yes', 'value');
    await tx.objectStore('meta').put(SCHEMA_VERSION, 'schema_version');
    await tx.done;
    try {
      this.persisted = (await this.env.storage?.persist?.()) ?? null;
    } catch {
      this.persisted = false;
    }
    this.emit();
  }
  /** 「残さない」：保存を消し、もう聞かないための印だけを書く */
  async dontKeep() {
    if (this.mode === 'view_only') return;
    if (this.db) {
      await this.clearDb();
      await this.db.put('consent', 'no', 'value');
    }
    this.mode = this.db ? 'not_kept' : 'unavailable';
    this.emit();
  }
  /** 「何も残さない」：印も書かない。次に開いたとき、また聞く */
  async keepNothing() {
    if (this.mode === 'view_only') return;
    if (this.db) await this.clearDb();
    this.mode = this.db ? 'undecided' : 'unavailable';
    this.askedThisSession = true;
    this.emit();
  }
  /** 全部消す：すべてのストアと、Service Worker のキャッシュ（ある場合） */
  async wipe() {
    if (this.mode === 'view_only') return;
    this.mem = emptyMem();
    if (this.db) await this.clearDb();
    try {
      const keys = (await this.env.caches?.keys()) ?? [];
      await Promise.all(keys.map((k) => this.env.caches!.delete(k)));
    } catch {
      /* キャッシュがなくても動く */
    }
    this.mode = this.db ? 'undecided' : 'unavailable';
    this.askedThisSession = false;
    this.persisted = null;
    this.emit();
  }

  /** 見るだけ：いまの中身をよけて、空の状態から始める。保存は読まず、書かない */
  startViewOnly() {
    if (this.mode === 'view_only') return;
    this.saved = { mem: this.mem, mode: this.mode };
    this.mem = emptyMem();
    this.mode = 'view_only';
    this.emit();
  }
  endViewOnly() {
    if (this.mode !== 'view_only' || !this.saved) return;
    this.mem = this.saved.mem;
    this.mode = this.saved.mode;
    this.saved = null;
    this.emit();
  }

  private async loadAll() {
    for (const s of STORES) {
      const tx = this.db!.transaction(s);
      let cur = await tx.store.openCursor();
      while (cur) {
        this.mem.get(s)!.set(String(cur.key), cur.value);
        cur = await cur.continue();
      }
    }
  }
  private async clearDb() {
    const tx = this.db!.transaction([...STORES], 'readwrite');
    await Promise.all(STORES.map((s) => tx.objectStore(s).clear()));
    await tx.done;
  }
}

function defaultEnv(): VaultEnv {
  const g = globalThis as unknown as { indexedDB?: IDBFactory; navigator?: Navigator; caches?: CacheStorage };
  return { indexedDB: g.indexedDB, storage: g.navigator?.storage, caches: g.caches };
}
