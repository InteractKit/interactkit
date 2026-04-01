/** Scored document returned from a similarity search. */
export interface ScoredDocument<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  content: string;
  metadata: TMeta;
  /** Similarity score — higher means more similar. Scale depends on the implementation. */
  score: number;
}

/** Document to be stored in the vector store. */
export interface VectorDocument<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Optional ID — if omitted, the adapter should generate one. */
  id?: string;
  content: string;
  metadata?: TMeta;
}

/** Delete criteria — at least one of `ids` or `filter` must be provided. */
export interface DeleteParams {
  ids?: string[];
  filter?: Record<string, unknown>;
}

/**
 * Minimal vector store interface for semantic search.
 *
 * Implementations wrap a concrete vector store (LangChain, Chroma, Pinecone, etc.)
 * and expose only the operations the memory entity needs.
 */
export interface VectorStoreAdapter<
  TMeta extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Add documents to the store. Returns the assigned IDs.
   */
  add(docs: VectorDocument<TMeta>[]): Promise<string[]>;

  /**
   * Search for documents similar to `query`.
   * @param query  — natural language query
   * @param k      — max results to return
   * @param filter — optional metadata filter (semantics are implementation-defined)
   */
  search(
    query: string,
    k: number,
    filter?: Partial<TMeta>,
  ): Promise<ScoredDocument<TMeta>[]>;

  /**
   * Delete documents by ID or metadata filter.
   */
  delete(params: DeleteParams): Promise<void>;
}
