/**
 * Semantic validation on GraphIR.
 *
 * Runs after XML parsing. Catches logical errors that XSD can't express:
 * ref targets exist, no component cycles, LLM entities have executors, etc.
 */

import type { GraphIR, EntityIR, FieldIR, ToolIR } from '../ir.js';

export interface ValidationError {
  entity?: string;
  field?: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validate(graph: GraphIR): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const entityMap = new Map(graph.entities.map(e => [e.name, e]));

  for (const entity of graph.entities) {
    validateEntityNaming(entity, errors);
    validateComponents(entity, entityMap, errors);
    validateRefs(entity, entityMap, graph, errors);
    validateState(entity, errors);
    validateTools(entity, errors, warnings);
    validateStreams(entity, errors);
    validateLLM(entity, errors);
    validateMCP(entity, errors);
  }

  validateNoDuplicateNames(graph, errors);
  validateNoCycles(graph, entityMap, errors);

  return { errors, warnings };
}

// ─── Entity naming ──────────────────────────────────────

function validateEntityNaming(entity: EntityIR, errors: ValidationError[]) {
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(entity.name)) {
    errors.push({
      entity: entity.name,
      message: `Entity name "${entity.name}" must be PascalCase (start with uppercase, alphanumeric only)`,
    });
  }
}

// ─── Components ─────────────────────────────────────────

function validateComponents(entity: EntityIR, entityMap: Map<string, EntityIR>, errors: ValidationError[]) {
  const seen = new Set<string>();
  for (const comp of entity.components) {
    if (!entityMap.has(comp.entity)) {
      errors.push({
        entity: entity.name,
        field: comp.name,
        message: `Component "${comp.name}" references unknown entity "${comp.entity}"`,
      });
    }
    if (seen.has(comp.name)) {
      errors.push({
        entity: entity.name,
        field: comp.name,
        message: `Duplicate component name "${comp.name}"`,
      });
    }
    seen.add(comp.name);
  }
}

// ─── Refs ───────────────────────────────────────────────

function validateRefs(entity: EntityIR, entityMap: Map<string, EntityIR>, graph: GraphIR, errors: ValidationError[]) {
  const seen = new Set<string>();
  for (const ref of entity.refs) {
    if (!entityMap.has(ref.entity)) {
      errors.push({
        entity: entity.name,
        field: ref.name,
        message: `Ref "${ref.name}" references unknown entity "${ref.entity}"`,
      });
    }
    if (seen.has(ref.name)) {
      errors.push({
        entity: entity.name,
        field: ref.name,
        message: `Duplicate ref name "${ref.name}"`,
      });
    }
    seen.add(ref.name);

    // Check ref target is reachable as sibling
    const parent = findParent(entity.name, graph);
    if (parent) {
      const siblingTypes = parent.components
        .filter(c => c.entity !== entity.name)
        .map(c => c.entity);
      if (!siblingTypes.includes(ref.entity)) {
        errors.push({
          entity: entity.name,
          field: ref.name,
          message: `Ref "${ref.name}" targets "${ref.entity}" which is not a sibling component of parent "${parent.name}"`,
        });
      }
    }
  }
}

function findParent(entityName: string, graph: GraphIR): EntityIR | undefined {
  return graph.entities.find(e =>
    e.components.some(c => c.entity === entityName)
  );
}

// ─── State ──────────────────────────────────────────────

function validateState(entity: EntityIR, errors: ValidationError[]) {
  const seen = new Set<string>();
  for (const field of entity.state) {
    if (seen.has(field.name)) {
      errors.push({ entity: entity.name, field: field.name, message: `Duplicate state field "${field.name}"` });
    }
    seen.add(field.name);
    validateField(entity, field, errors);
  }
}

function validateField(entity: EntityIR, field: FieldIR, errors: ValidationError[]) {
  if (field.type === 'array' && !field.items) {
    errors.push({
      entity: entity.name,
      field: field.name,
      message: `Array field "${field.name}" must have "items" attribute`,
    });
  }
  if (field.type === 'record' && !field.values) {
    errors.push({
      entity: entity.name,
      field: field.name,
      message: `Record field "${field.name}" must have "values" attribute`,
    });
  }
  if (field.type === 'object' && field.children.length === 0) {
    errors.push({
      entity: entity.name,
      field: field.name,
      message: `Object field "${field.name}" must have nested <field> children`,
    });
  }

  // Validate constraints match field type
  if (field.validate) {
    const v = field.validate;
    if (field.type !== 'string') {
      if (v.minLength != null || v.maxLength != null || v.pattern != null || v.format != null) {
        errors.push({
          entity: entity.name,
          field: field.name,
          message: `String constraints (min-length, max-length, pattern, format) not valid on "${field.type}" field`,
        });
      }
    }
    if (field.type !== 'number') {
      if (v.min != null || v.max != null || v.integer != null) {
        errors.push({
          entity: entity.name,
          field: field.name,
          message: `Number constraints (min, max, integer) not valid on "${field.type}" field`,
        });
      }
    }
    if (field.type !== 'array') {
      if (v.minItems != null || v.maxItems != null) {
        errors.push({
          entity: entity.name,
          field: field.name,
          message: `Array constraints (min-items, max-items) not valid on "${field.type}" field`,
        });
      }
    }
  }

  // Recurse into children
  for (const child of field.children) {
    validateField(entity, child, errors);
  }
}

// ─── Tools ──────────────────────────────────────────────

function validateTools(entity: EntityIR, errors: ValidationError[], warnings: ValidationError[]) {
  const seen = new Set<string>();
  for (const tool of entity.tools) {
    if (seen.has(tool.name)) {
      errors.push({ entity: entity.name, field: tool.name, message: `Duplicate tool name "${tool.name}"` });
    }
    seen.add(tool.name);

    // Reserved names
    if (tool.name === 'init' || tool.name === 'describe' || tool.name === 'invoke') {
      errors.push({
        entity: entity.name,
        field: tool.name,
        message: `Tool name "${tool.name}" is reserved`,
      });
    }

    // Validate src path format
    if (tool.src) {
      if (tool.src.startsWith('/') || tool.src.startsWith('..')) {
        errors.push({
          entity: entity.name,
          field: tool.name,
          message: `Tool src "${tool.src}" must be a relative path within the interactkit/ directory`,
        });
      }
    }

    // Warn if non-LLM, non-autotool, non-memory tool has no src — it will need a handler at runtime
    if (!tool.src && !tool.auto && entity.type !== 'llm' && entity.type !== 'long-term-memory') {
      warnings.push({
        entity: entity.name,
        field: tool.name,
        message: `Tool "${tool.name}" has no src — must be provided via handlers in configure() at runtime`,
      });
    }
  }
}

// ─── Streams ────────────────────────────────────────────

function validateStreams(entity: EntityIR, errors: ValidationError[]) {
  const seen = new Set<string>();
  for (const stream of entity.streams) {
    if (seen.has(stream.name)) {
      errors.push({ entity: entity.name, field: stream.name, message: `Duplicate stream name "${stream.name}"` });
    }
    seen.add(stream.name);
  }
}

// ─── LLM ────────────────────────────────────────────────

function validateLLM(entity: EntityIR, errors: ValidationError[]) {
  if (entity.type === 'llm') {
    if (!entity.executor) {
      errors.push({ entity: entity.name, message: 'LLM entity must have an <executor> element' });
    }
  } else {
    if (entity.executor) {
      errors.push({ entity: entity.name, message: `Non-LLM entity (type="${entity.type}") must not have <executor>` });
    }
    if (entity.thinkingLoop) {
      errors.push({ entity: entity.name, message: `Non-LLM entity (type="${entity.type}") must not have <thinking-loop>` });
    }
  }
}

// ─── MCP ────────────────────────────────────────────────

function validateMCP(entity: EntityIR, errors: ValidationError[]) {
  if (entity.type === 'mcp') {
    if (!entity.mcp) {
      errors.push({ entity: entity.name, message: 'MCP entity must have an <mcp> element with transport' });
    }
  } else {
    if (entity.mcp) {
      errors.push({ entity: entity.name, message: `Non-MCP entity (type="${entity.type}") must not have <mcp>` });
    }
  }
}

// ─── Global validations ─────────────────────────────────

function validateNoDuplicateNames(graph: GraphIR, errors: ValidationError[]) {
  const seen = new Set<string>();
  for (const entity of graph.entities) {
    if (seen.has(entity.name)) {
      errors.push({ entity: entity.name, message: `Duplicate entity name "${entity.name}"` });
    }
    seen.add(entity.name);
  }
}

function validateNoCycles(graph: GraphIR, entityMap: Map<string, EntityIR>, errors: ValidationError[]) {
  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(name: string): boolean {
    if (stack.has(name)) return true; // cycle
    if (visited.has(name)) return false;
    visited.add(name);
    stack.add(name);

    const entity = entityMap.get(name);
    if (entity) {
      for (const comp of entity.components) {
        if (dfs(comp.entity)) {
          errors.push({
            entity: name,
            message: `Component cycle detected: ${name} → ${comp.entity}`,
          });
          return true;
        }
      }
    }

    stack.delete(name);
    return false;
  }

  for (const entity of graph.entities) {
    dfs(entity.name);
  }
}
