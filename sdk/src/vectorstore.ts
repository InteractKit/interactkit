/**
 * Vector store adapter interface for long-term memory entities.
 */

export interface ScoredDocument<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  content: string;
  metadata: TMeta;
  score: number;
}

export interface VectorDocument<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  id?: string;
  content: string;
  metadata?: TMeta;
}

export interface DeleteParams {
  ids?: string[];
  filter?: Record<string, unknown>;
}

export interface VectorStoreAdapter<TMeta extends Record<string, unknown> = Record<string, unknown>> {
  add(docs: VectorDocument<TMeta>[]): Promise<string[]>;
  search(query: string, k: number, filter?: Partial<TMeta>): Promise<ScoredDocument<TMeta>[]>;
  delete(params: DeleteParams): Promise<void>;
}

/**
 * Create auto-handlers for a long-term-memory entity.
 * Namespaces all documents by entity ID for tenant isolation.
 */
export function createMemoryHandlers(vectorStore: VectorStoreAdapter) {
  return {
    memorize: async (entity: any, input: { content: string; tags?: string[]; metadata?: Record<string, unknown> }) => {
      const meta = {
        ...(input.metadata ?? {}),
        _namespace: entity.id,
        ...(input.tags ? { _tags: input.tags.join(',') } : {}),
      };
      const [id] = await vectorStore.add([{ content: input.content, metadata: meta }]);
      return { id };
    },

    recall: async (entity: any, input: { query: string; k?: number; tags?: string[]; scoreThreshold?: number }) => {
      const k = input.k ?? 5;
      const results = await vectorStore.search(input.query, k * 2, { _namespace: entity.id } as any);

      let filtered = results;

      // Filter by tags if provided
      if (input.tags && input.tags.length > 0) {
        filtered = filtered.filter(r => {
          const docTags = ((r.metadata as any)?._tags ?? '').split(',');
          return input.tags!.some(t => docTags.includes(t));
        });
      }

      // Filter by score threshold
      if (input.scoreThreshold != null) {
        filtered = filtered.filter(r => r.score >= input.scoreThreshold!);
      }

      return filtered.slice(0, k).map(r => ({
        id: r.id,
        content: r.content,
        score: r.score,
        tags: ((r.metadata as any)?._tags ?? '').split(',').filter(Boolean),
        metadata: r.metadata,
      }));
    },

    forget: async (entity: any, input: { ids?: string[] }) => {
      if (input.ids && input.ids.length > 0) {
        await vectorStore.delete({ ids: input.ids });
        return { deleted: input.ids.length };
      }
      // Delete all for this namespace
      await vectorStore.delete({ filter: { _namespace: entity.id } as any });
      return { deleted: -1 }; // unknown count
    },
  };
}
