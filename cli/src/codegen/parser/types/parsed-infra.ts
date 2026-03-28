export interface ParsedInfra {
  pubsub?: string;
  /** Whether the pubsub extends RemotePubSubAdapter (vs LocalPubSubAdapter). */
  pubsubIsRemote?: boolean;
  database?: string;
  logger?: string;
}
