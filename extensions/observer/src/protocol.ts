import type { EventEnvelope } from "@interactkit/sdk";
import type { EntityTree } from "@interactkit/sdk";

// ─── Frontend → Backend ────────────────────────────────

export interface AuthMessage {
  type: "auth";
  token: string;
}

export interface StateGetRequest {
  type: "state:get";
  requestId: string;
  entityId: string;
  field: string;
}

export interface StateSetRequest {
  type: "state:set";
  entityId: string;
  field: string;
  value: unknown;
}

export interface MethodCallRequest {
  type: "method:call";
  requestId: string;
  entityId: string;
  method: string;
  payload?: unknown;
}

export interface EntityTreeRequest {
  type: "entity:tree";
  requestId: string;
}

export type ClientMessage =
  | AuthMessage
  | StateGetRequest
  | StateSetRequest
  | MethodCallRequest
  | EntityTreeRequest;

// ─── Backend → Frontend ────────────────────────────────

export interface EventMessage {
  type: "event";
  envelope: EventEnvelope;
}

export interface ErrorMessage {
  type: "error";
  envelope: EventEnvelope;
  error: { message: string; stack?: string };
}

export interface ResponseMessage {
  type: "response";
  requestId: string;
  value?: unknown;
  error?: string;
}

export interface AuthResultMessage {
  type: "auth:result";
  ok: boolean;
  error?: string;
}

export type ServerMessage =
  | EventMessage
  | ErrorMessage
  | ResponseMessage
  | AuthResultMessage;
