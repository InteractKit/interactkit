import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { generateDeploymentPlan } from '@/codegen/deploy/index.js';
import type { ParsedEntity } from '@/codegen/parser/types/parsed-entity.js';

/** Generate Dockerfile and docker-compose files. */
export function generateDocker(entities: ParsedEntity[], generatedDir: string) {
  const plan = generateDeploymentPlan(entities);
  const hasMultipleUnits = plan.units.length > 1;
  const hasRemoteHooks = entities.some(e => e.hooks.some(h => !h.inProcess));

  // Dockerfile
  const dockerfile = [
    'FROM node:20-slim AS build',
    'WORKDIR /app',
    'COPY package.json pnpm-lock.yaml* ./',
    'RUN corepack enable && pnpm install --frozen-lockfile',
    'COPY . .',
    'RUN pnpm run build',
    '',
    'FROM node:20-slim',
    'WORKDIR /app',
    'COPY --from=build /app/node_modules ./node_modules',
    'COPY --from=build /app/.interactkit/build ./dist',
    'COPY --from=build /app/config ./config',
    'ENV NODE_ENV=production',
    'CMD ["node", "dist/src/_entry.js"]',
    '',
  ].join('\n');
  writeFileSync(resolve(generatedDir, 'Dockerfile'), dockerfile);

  // docker-compose.single.yml
  const singleCompose: any = {
    services: {
      app: {
        build: { context: '../..', dockerfile: '.interactkit/generated/Dockerfile' },
        env_file: '.env',
        restart: 'unless-stopped',
      },
    },
  };
  if (hasMultipleUnits) {
    singleCompose.services.redis = { image: 'redis:7-alpine', ports: ['6379:6379'] };
    singleCompose.services.app.depends_on = ['redis'];
    singleCompose.services.app.environment = { REDIS_HOST: 'redis', REDIS_PORT: '6379' };
  }
  writeFileSync(resolve(generatedDir, 'docker-compose.single.yml'), yamlStringify(singleCompose));

  // docker-compose.yml — distributed
  if (hasMultipleUnits) {
    const distCompose: any = { services: {} };

    distCompose.services.redis = {
      image: 'redis:7-alpine',
      ports: ['6379:6379'],
      restart: 'unless-stopped',
    };

    for (const unit of plan.units) {
      const svcName = unit.name.replace(/^unit-/, '');
      distCompose.services[svcName] = {
        build: { context: '../..', dockerfile: '.interactkit/generated/Dockerfile' },
        command: `node dist/src/_${unit.name}.js`,
        env_file: '.env',
        environment: { REDIS_HOST: 'redis', REDIS_PORT: '6379' },
        depends_on: ['redis'],
        restart: 'unless-stopped',
        ...(unit.scalable ? { deploy: { replicas: 2 } } : {}),
      };
    }

    if (hasRemoteHooks) {
      distCompose.services.hooks = {
        build: { context: '../..', dockerfile: '.interactkit/generated/Dockerfile' },
        command: 'node dist/src/_hooks.js',
        env_file: '.env',
        environment: { REDIS_HOST: 'redis', REDIS_PORT: '6379' },
        depends_on: ['redis'],
        restart: 'unless-stopped',
      };
    }

    writeFileSync(resolve(generatedDir, 'docker-compose.yml'), yamlStringify(distCompose));
    console.log(`  docker: Dockerfile + compose (single + distributed)`);
  } else {
    console.log(`  docker: Dockerfile + compose (single)`);
  }
}

/** Minimal YAML serializer for docker-compose (no dependency needed) */
function yamlStringify(obj: any, indent = 0): string {
  const pad = '  '.repeat(indent);
  let out = '';
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      out += `${pad}${key}: ${typeof val === 'string' && val.includes(':') ? `"${val}"` : val}\n`;
    } else if (Array.isArray(val)) {
      out += `${pad}${key}:\n`;
      for (const item of val) {
        if (typeof item === 'string') {
          out += `${pad}  - ${item.includes(':') ? `"${item}"` : item}\n`;
        } else {
          out += `${pad}  -\n${yamlStringify(item, indent + 2)}`;
        }
      }
    } else {
      out += `${pad}${key}:\n${yamlStringify(val, indent + 1)}`;
    }
  }
  return out;
}
