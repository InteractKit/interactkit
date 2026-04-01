import type {
  VectorStoreAdapter,
  VectorDocument,
  ScoredDocument,
  DeleteParams,
} from '@interactkit/sdk';

export interface ChromaDBAdapterConfig {
  /** ChromaDB collection name. */
  collection: string;
  /** ChromaDB server URL (default: "http://localhost:8000"). */
  url?: string;
  /** Tenant name (default: "default_tenant"). */
  tenant?: string;
  /** Database name (default: "default_database"). */
  database?: string;
}

/**
 * ChromaDB adapter for InteractKit.
 * Uses ChromaDB's built-in embedding function — no external embeddings needed.
 *
 * ```typescript
 * import { ChromaDBVectorStoreAdapter } from '@interactkit/chromadb';
 *
 * export default {
 *   vectorStore: new ChromaDBVectorStoreAdapter({
 *     collection: 'agent-memory',
 *   }),
 * } satisfies InteractKitConfig;
 * ```
 */
export class ChromaDBVectorStoreAdapter implements VectorStoreAdapter {
  private readonly config: ChromaDBAdapterConfig;
  private client: any = null;
  private collection: any = null;

  constructor(config: ChromaDBAdapterConfig) {
    this.config = config;
  }

  private async ensureCollection(): Promise<any> {
    if (this.collection) return this.collection;

    let ChromaClient: any;
    try {
      const mod = await import('chromadb');
      ChromaClient = mod.ChromaClient;
    } catch {
      throw new Error(
        'ChromaDBVectorStoreAdapter requires "chromadb". Install it: pnpm add chromadb',
      );
    }

    this.client = new ChromaClient({
      path: this.config.url ?? 'http://localhost:8000',
      tenant: this.config.tenant,
      database: this.config.database,
    });

    this.collection = await this.client.getOrCreateCollection({
      name: this.config.collection,
    });

    return this.collection;
  }

  async add(docs: VectorDocument[]): Promise<string[]> {
    const col = await this.ensureCollection();

    const ids = docs.map((d) => d.id ?? crypto.randomUUID());
    const documents = docs.map((d) => d.content);
    const metadatas = docs.map((d) => flattenMetadata(d.metadata ?? {}));

    await col.add({ ids, documents, metadatas });
    return ids;
  }

  async search(
    query: string,
    k: number,
    filter?: Record<string, unknown>,
  ): Promise<ScoredDocument[]> {
    const col = await this.ensureCollection();

    const where = filter ? flattenMetadata(filter) : undefined;
    const results = await col.query({
      queryTexts: [query],
      nResults: k,
      where: where && Object.keys(where).length > 0 ? where : undefined,
    });

    const docs: ScoredDocument[] = [];
    const ids = results.ids?.[0] ?? [];
    const documents = results.documents?.[0] ?? [];
    const metadatas = results.metadatas?.[0] ?? [];
    const distances = results.distances?.[0] ?? [];

    for (let i = 0; i < ids.length; i++) {
      docs.push({
        id: ids[i],
        content: documents[i] ?? '',
        metadata: (metadatas[i] as Record<string, unknown>) ?? {},
        // ChromaDB returns distances (lower = more similar).
        // Convert to similarity score: 1 / (1 + distance).
        score: 1 / (1 + (distances[i] ?? 0)),
      });
    }

    return docs;
  }

  async delete(params: DeleteParams): Promise<void> {
    const col = await this.ensureCollection();

    if (params.ids?.length) {
      await col.delete({ ids: params.ids });
    } else if (params.filter) {
      const where = flattenMetadata(params.filter);
      if (Object.keys(where).length > 0) {
        await col.delete({ where });
      }
    }
  }
}

/**
 * ChromaDB metadata values must be string | number | boolean.
 * Flatten arrays/objects to JSON strings.
 */
function flattenMetadata(
  meta: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const flat: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      flat[k] = v;
    } else {
      flat[k] = JSON.stringify(v);
    }
  }
  return flat;
}
