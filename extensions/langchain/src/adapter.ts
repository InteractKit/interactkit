import type {
  VectorStoreAdapter,
  VectorDocument,
  ScoredDocument,
  DeleteParams,
} from '@interactkit/sdk';
import type { VectorStoreInterface } from '@langchain/core/vectorstores';
import { Document } from '@langchain/core/documents';

export interface LangChainAdapterConfig {
  /** Any LangChain VectorStore instance (MemoryVectorStore, Chroma, Pinecone, FAISS, etc.) */
  store: VectorStoreInterface;
}

/**
 * Wraps any LangChain VectorStore as an InteractKit VectorStoreAdapter.
 *
 * ```typescript
 * import { LangChainVectorStoreAdapter } from '@interactkit/langchain';
 * import { MemoryVectorStore } from 'langchain/vectorstores/memory';
 * import { OpenAIEmbeddings } from '@langchain/openai';
 *
 * export default {
 *   vectorStore: new LangChainVectorStoreAdapter({
 *     store: new MemoryVectorStore(new OpenAIEmbeddings()),
 *   }),
 * } satisfies InteractKitConfig;
 * ```
 */
export class LangChainVectorStoreAdapter implements VectorStoreAdapter {
  private store: VectorStoreInterface;

  constructor(config: LangChainAdapterConfig) {
    this.store = config.store;
  }

  async add(docs: VectorDocument[]): Promise<string[]> {
    const lcDocs = docs.map(
      (d) =>
        new Document({
          pageContent: d.content,
          metadata: d.metadata ?? {},
          id: d.id ?? crypto.randomUUID(),
        }),
    );

    const result = await this.store.addDocuments(lcDocs);

    if (Array.isArray(result) && result.length > 0) {
      return result;
    }
    return lcDocs.map((d) => d.id!);
  }

  async search(
    query: string,
    k: number,
    filter?: Record<string, unknown>,
  ): Promise<ScoredDocument[]> {
    const results = await this.store.similaritySearchWithScore(
      query,
      k,
      filter as any,
    );

    return results.map(([doc, score]) => ({
      id: doc.id ?? 'unknown',
      content: doc.pageContent,
      metadata: doc.metadata as Record<string, unknown>,
      score,
    }));
  }

  async delete(params: DeleteParams): Promise<void> {
    await this.store.delete({
      ids: params.ids,
      filter: params.filter as any,
    });
  }
}
