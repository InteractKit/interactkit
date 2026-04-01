import type {
  VectorStoreAdapter,
  VectorDocument,
  ScoredDocument,
  DeleteParams,
} from '@interactkit/sdk';

/** Function that takes text and returns an embedding vector. */
export type EmbedFn = (text: string) => Promise<number[]>;

/** LangChain-compatible embeddings interface — only the method we need. */
export interface EmbeddingsLike {
  embedQuery(text: string): Promise<number[]>;
}

export interface PineconeAdapterConfig {
  /** Pinecone API key. */
  apiKey: string;
  /** Pinecone index name. */
  index: string;
  /** Pinecone namespace (default: ""). */
  namespace?: string;
  /** Embedding function — provide either this or `embeddings`. */
  embed?: EmbedFn;
  /** LangChain Embeddings instance (e.g. `new OpenAIEmbeddings()`). Alternative to `embed`. */
  embeddings?: EmbeddingsLike;
}

/**
 * Pinecone adapter for InteractKit.
 * Requires a user-provided embedding function.
 *
 * ```typescript
 * import { PineconeVectorStoreAdapter } from '@interactkit/pinecone';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 *
 * // Option 1: LangChain embeddings
 * vectorStore: new PineconeVectorStoreAdapter({
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   index: 'agent-memory',
 *   embeddings: new OpenAIEmbeddings(),
 * })
 *
 * // Option 2: Raw function
 * vectorStore: new PineconeVectorStoreAdapter({
 *   apiKey: process.env.PINECONE_API_KEY!,
 *   index: 'agent-memory',
 *   embed: async (text) => { ... },
 * })
 * ```
 */
export class PineconeVectorStoreAdapter implements VectorStoreAdapter {
  private readonly config: PineconeAdapterConfig;
  private readonly _embed: EmbedFn;
  private index: any = null;

  constructor(config: PineconeAdapterConfig) {
    if (!config.embed && !config.embeddings) {
      throw new Error('PineconeVectorStoreAdapter requires either `embed` or `embeddings`');
    }
    this.config = config;
    this._embed = config.embed ?? ((text) => config.embeddings!.embedQuery(text));
  }

  private async ensureIndex(): Promise<any> {
    if (this.index) return this.index;

    let Pinecone: any;
    try {
      const mod = await import('@pinecone-database/pinecone');
      Pinecone = mod.Pinecone;
    } catch {
      throw new Error(
        'PineconeVectorStoreAdapter requires "@pinecone-database/pinecone". Install it: pnpm add @pinecone-database/pinecone',
      );
    }

    const pc = new Pinecone({ apiKey: this.config.apiKey });
    this.index = pc.index(this.config.index);
    return this.index;
  }

  private get ns(): string {
    return this.config.namespace ?? '';
  }

  async add(docs: VectorDocument[]): Promise<string[]> {
    const idx = await this.ensureIndex();
    const ids: string[] = [];
    const vectors: any[] = [];

    for (const doc of docs) {
      const id = doc.id ?? crypto.randomUUID();
      const embedding = await this._embed(doc.content);

      vectors.push({
        id,
        values: embedding,
        metadata: { content: doc.content, ...doc.metadata },
      });
      ids.push(id);
    }

    await idx.namespace(this.ns).upsert(vectors);
    return ids;
  }

  async search(
    query: string,
    k: number,
    filter?: Record<string, unknown>,
  ): Promise<ScoredDocument[]> {
    const idx = await this.ensureIndex();
    const queryEmbedding = await this._embed(query);

    const results = await idx.namespace(this.ns).query({
      vector: queryEmbedding,
      topK: k,
      includeMetadata: true,
      filter: filter && Object.keys(filter).length > 0 ? filter : undefined,
    });

    return (results.matches ?? []).map((match: any) => ({
      id: match.id,
      content: (match.metadata?.content as string) ?? '',
      metadata: (match.metadata as Record<string, unknown>) ?? {},
      score: match.score ?? 0,
    }));
  }

  async delete(params: DeleteParams): Promise<void> {
    const idx = await this.ensureIndex();

    if (params.ids?.length) {
      await idx.namespace(this.ns).deleteMany(params.ids);
    } else if (params.filter) {
      await idx.namespace(this.ns).deleteMany({ filter: params.filter });
    }
  }
}
