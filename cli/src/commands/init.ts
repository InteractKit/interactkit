import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { select } from '@inquirer/prompts';
import { compileEntity, compileReadme } from '../templates/compiler.js';
import type { TemplateDefinition } from '../templates/compiler.js';

type Database = 'sqlite' | 'postgres' | 'none';

/** Load all template JSON files from the templates directory */
function loadTemplates(): TemplateDefinition[] {
  const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../');
  const templatesDir = resolve(cliRoot, 'templates');
  const files = readdirSync(templatesDir).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(readFileSync(resolve(templatesDir, f), 'utf-8')));
}

export async function initCommand(projectName: string) {
  const projectDir = resolve(process.cwd(), projectName);

  if (existsSync(projectDir)) {
    console.error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  const templates = loadTemplates();

  const template = await select<TemplateDefinition>({
    message: 'What are you building?',
    choices: templates.map(t => ({ value: t, name: t.label })),
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
  mkdirSync(resolve(projectDir, 'config'), { recursive: true });

  // ─── package.json ─────────────────────────────────────────

  const deps: Record<string, string> = {
    '@interactkit/sdk': '^0.2.0',
    'class-validator': '^0.14.1',
    'dotenv': '^16.4.0',
    'reflect-metadata': '^0.2.2',
  };
  if (database !== 'none') {
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
      build: `interactkit build --root=src/entities/${template.root.file}:${template.root.class}`,
      dev: `interactkit dev --root=src/entities/${template.root.file}:${template.root.class}`,
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

  // ─── config ───────────────────────────────────────────────

  const config: Record<string, any> = { interactkit: {} };
  if (database === 'sqlite') {
    config.interactkit.database = { url: 'file:./interactkit.db' };
  } else if (database === 'postgres') {
    config.interactkit.database = { url: 'postgresql://localhost:5432/interactkit' };
  }
  writeFileSync(resolve(projectDir, 'config/default.json'), JSON.stringify(config, null, 2) + '\n');

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
    const isRoot = entity.file === template.root.file && entity.class === template.root.class;
    const code = compileEntity(entity, isRoot ? { database: database === 'none' ? 'none' : 'prisma' } : undefined);
    const filePath = resolve(projectDir, `src/entities/${entity.file}.ts`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, code);
  }

  // ─── Summary ──────────────────────────────────────────────

  console.log('  Created:');
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
