import { BaseEntity } from '../entity/types.js';
import { Entity, State, Hook } from '../entity/decorators/index.js';
import { Tool } from '../llm/decorators.js';
import { Init } from '../hooks/init.js';
import { BaseWrapper } from '../entity/wrappers/base-wrapper.js';
import type {
  VectorStoreAdapter,
  VectorDocument,
  ScoredDocument,
} from './adapter.js';

/** Input for the memorize() tool. */
export interface StoreInput {
  /** The content to memorize. */
  content: string;
  /** Tags for categorization. */
  tags?: string[];
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/** A stored memory returned from recall(). */
export interface Memory {
  id: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  score: number;
  storedAt: number;
}

/** Input for the recall() tool. */
export interface RecallInput {
  /** Natural language query to search for relevant memories. */
  query: string;
  /** Max results to return (default: 5). */
  k?: number;
  /** Filter by tags — all must match. */
  tags?: string[];
  /** Minimum similarity score threshold. */
  scoreThreshold?: number;
}

/** Input for the forget() tool. */
export interface ForgetInput {
  /** Specific document IDs to forget. */
  ids?: string[];
}

/**
 * Long-term semantic memory backed by a VectorStoreAdapter.
 *
 * Reads the vector store from `interactkit.config.ts` — no subclassing needed.
 * Namespace is auto-derived from the entity ID, so multiple instances
 * sharing the same vector store are isolated by default.
 *
 * Use as a @Component or @Ref on any entity. When attached to an LLMEntity,
 * the tools are automatically available to the LLM as memory_memorize, memory_recall, memory_forget.
 *
 * ```typescript
 * class Agent extends LLMEntity {
 *   @Component() private memory!: Remote<LongTermMemory>;
 *   // LLM can call memory_memorize(), memory_recall(), memory_forget()
 * }
 * ```
 */
@Entity({ description: 'Long-term semantic memory backed by a vector store' })
export class LongTermMemory extends BaseEntity {
  @State({ description: 'Namespace — derived from entity ID at boot' })
  private namespace = '';

  @State({ description: 'Default number of results for recall' })
  private defaultK = 5;

  private _vectorStore: VectorStoreAdapter | null = null;

  @Hook(Init.Runner())
  async onInit(_input: Init.Input) {
    const store = BaseWrapper.getVectorStore();
    if (!store) {
      throw new Error(
        'LongTermMemory requires a vectorStore in interactkit.config.ts',
      );
    }
    this._vectorStore = store;
    if (!this.namespace) {
      this.namespace = this.id;
    }
  }

  private get vs(): VectorStoreAdapter {
    if (!this._vectorStore) {
      throw new Error('VectorStore not initialized — onInit has not run yet');
    }
    return this._vectorStore;
  }

  @Tool({ description: 'Store a memory in long-term storage. Provide content and optionally tags and metadata.' })
  async memorize(input: StoreInput): Promise<{ id: string }> {
    const now = Date.now();

    const doc: VectorDocument = {
      content: input.content,
      metadata: {
        namespace: this.namespace,
        tags: input.tags ?? [],
        storedAt: now,
        ...input.metadata,
      },
    };

    const ids = await this.vs.add([doc]);
    return { id: ids[0] };
  }

  @Tool({ description: 'Recall relevant memories by semantic similarity. Provide a query and optionally k, tags, and scoreThreshold.' })
  async recall(input: RecallInput): Promise<Memory[]> {
    const k = input.k ?? this.defaultK;

    const results: ScoredDocument[] = await this.vs.search(
      input.query,
      k,
      { namespace: this.namespace } as any,
    );

    let memories: Memory[] = results.map((doc) => ({
      id: doc.id,
      content: doc.content,
      tags: (doc.metadata?.tags as string[]) ?? [],
      metadata: doc.metadata,
      score: doc.score,
      storedAt: (doc.metadata?.storedAt as number) ?? 0,
    }));

    if (input.scoreThreshold != null) {
      memories = memories.filter((m) => m.score >= input.scoreThreshold!);
    }

    if (input.tags?.length) {
      memories = memories.filter((m) =>
        input.tags!.every((tag) => m.tags.includes(tag)),
      );
    }

    return memories;
  }

  @Tool({ description: 'Forget memories from long-term storage by IDs.' })
  async forget(input: ForgetInput): Promise<{ deleted: number }> {
    if (input.ids?.length) {
      await this.vs.delete({ ids: input.ids });
      return { deleted: input.ids.length };
    }

    return { deleted: 0 };
  }
}
