import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { select } from '@inquirer/prompts';
import { compileEntity, compileReadme } from '@/templates/compiler.js';
import type { TemplateDefinition } from '@/templates/compiler.js';
import agentTemplate from '@/templates/agent.json' with { type: 'json' };
import blankTemplate from '@/templates/blank.json' with { type: 'json' };
import simulationTemplate from '@/templates/simulation.json' with { type: 'json' };
import teamTemplate from '@/templates/team.json' with { type: 'json' };

type Database = 'sqlite' | 'postgres' | 'none';

const templates: TemplateDefinition[] = [agentTemplate, blankTemplate, simulationTemplate, teamTemplate] as TemplateDefinition[];

export async function initCommand(projectName: string) {
  const projectDir = resolve(process.cwd(), projectName);

  if (existsSync(projectDir)) {
    console.error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  const template = await select<TemplateDefinition>({
    message: 'What are you building?',
    choices: templates.map((t: TemplateDefinition) => ({ value: t, name: t.label })),
  });

  const database = await select<Database>({
    message: 'Database for state persistence?',
    choices: [
      { value: 'sqlite', name: 'SQLite         zero config, file-based (recommended)' },
      { value: 'postgres', name: 'PostgreSQL     production-ready, requires connection string' },
      { value: 'none', name: 'None           in-memory only (state lost on restart)' },
    ],
  });

  console.log(`\n▸ Creating InteractKit project: ${projectName} (${template.name}, ${database === 'none' ? 'no db' : database})\n`);

  mkdirSync(resolve(projectDir, 'src/entities'), { recursive: true });

  // ─── package.json ─────────────────────────────────────────

  const deps: Record<string, string> = {
    '@interactkit/sdk': '^0.2.0',
    'reflect-metadata': '^0.2.2',
  };
  if (database !== 'none') {
    deps['@interactkit/prisma'] = '^0.2.0';
    deps['prisma'] = '^6.0.0';
    deps['@prisma/client'] = '^6.0.0';
  }
  if (template.entities.some(e => e.extends === 'LLMEntity')) {
    deps['@langchain/openai'] = '^0.5.0';
  }
  if (template.extraDeps) {
    Object.assign(deps, template.extraDeps);
  }

  writeFileSync(resolve(projectDir, 'package.json'), JSON.stringify({
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      build: 'interactkit build',
      dev: 'interactkit dev',
      start: 'interactkit start',
      ...(database !== 'none' ? { 'db:migrate': 'prisma migrate dev', 'db:push': 'prisma db push' } : {}),
    },
    dependencies: deps,
    devDependencies: {
      '@interactkit/cli': '^0.2.0',
      '@types/node': '^25.5.0',
      typescript: '^5.5.0',
    },
  }, null, 2) + '\n');

  // ─── tsconfig.json ────────────────────────────────────────

  writeFileSync(resolve(projectDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      outDir: './.interactkit/build',
      rootDirs: ['./src', './.interactkit/generated'],
      declaration: true,
      sourceMap: true,
      skipLibCheck: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
    },
    include: ['src/**/*.ts', '.interactkit/generated/**/*.ts'],
  }, null, 2) + '\n');

  // ─── .gitignore ───────────────────────────────────────────

  writeFileSync(resolve(projectDir, '.gitignore'), `dist/
node_modules/
*.tsbuildinfo
.interactkit/
.env
*.db
`);

  // ─── interactkit.config.ts ────────────────────────────────

  const rootImport = `import { ${template.root.class} } from './src/entities/${template.root.file}.js';`;

  if (database === 'sqlite') {
    writeFileSync(resolve(projectDir, 'interactkit.config.ts'),
`import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
${rootImport}

export default {
  root: ${template.root.class},
  database: new PrismaDatabaseAdapter({ url: 'file:./interactkit.db' }),
  observer: new DevObserver(),
} satisfies InteractKitConfig;
`);
  } else if (database === 'postgres') {
    writeFileSync(resolve(projectDir, 'interactkit.config.ts'),
`import { PrismaDatabaseAdapter } from '@interactkit/prisma';
import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
${rootImport}

export default {
  root: ${template.root.class},
  database: new PrismaDatabaseAdapter({ url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/interactkit' }),
  observer: new DevObserver(),
} satisfies InteractKitConfig;
`);
  } else {
    writeFileSync(resolve(projectDir, 'interactkit.config.ts'),
`import { DevObserver } from '@interactkit/sdk';
import type { InteractKitConfig } from '@interactkit/sdk';
${rootImport}

export default {
  root: ${template.root.class},
  database: undefined!,  // No database — state is in-memory only
  observer: new DevObserver(),
} satisfies InteractKitConfig;
`);
  }

  // ─── Prisma ───────────────────────────────────────────────

  if (database !== 'none') {
    mkdirSync(resolve(projectDir, 'prisma'), { recursive: true });
    const provider = database === 'sqlite' ? 'sqlite' : 'postgresql';
    writeFileSync(resolve(projectDir, 'prisma/schema.prisma'),
`datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model EntityState {
  id    String @id
  state String // JSON blob
}
`);
    const dbUrl = database === 'sqlite' ? 'file:./interactkit.db' : 'postgresql://localhost:5432/interactkit';
    writeFileSync(resolve(projectDir, '.env'), `DATABASE_URL="${dbUrl}"\n`);
    writeFileSync(resolve(projectDir, '.env.example'), `DATABASE_URL="${dbUrl}"\n# ANTHROPIC_API_KEY=sk-ant-...\n# OPENAI_API_KEY=sk-...\n`);
  } else {
    writeFileSync(resolve(projectDir, '.env.example'), `# ANTHROPIC_API_KEY=sk-ant-...\n# OPENAI_API_KEY=sk-...\n`);
  }

  // ─── README ───────────────────────────────────────────────

  writeFileSync(resolve(projectDir, 'README.md'), compileReadme(template, projectName, database !== 'none'));

  // ─── Entities (compiled from template JSON) ───────────────

  for (const entity of template.entities) {
    const code = compileEntity(entity);
    const filePath = resolve(projectDir, `src/entities/${entity.file}.ts`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, code);
  }

  // ─── Summary ──────────────────────────────────────────────

  console.log('  Created:');
  console.log('    interactkit.config.ts');
  for (const entity of template.entities) {
    console.log(`    src/entities/${entity.file}.ts  (${entity.class})`);
  }
  if (database !== 'none') {
    console.log('    prisma/schema.prisma');
    console.log('    .env');
  }
  console.log('    .env.example');
  console.log('    README.md');

  console.log(`\n▸ Next steps:\n`);
  console.log(`  cd ${projectName}`);
  console.log('  pnpm install');
  if (database !== 'none') console.log('  pnpm db:push');
  console.log('  pnpm dev');
  console.log('');
}
