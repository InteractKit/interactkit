#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('interactkit')
  .description('CLI for InteractKit projects')
  .version('0.3.0');

// ─── Shared helpers ─────────────────────────────────────

async function findXmlFiles(cwd: string): Promise<string[]> {
  const { readdirSync } = await import('node:fs');
  const { resolve, join } = await import('node:path');

  const interactkitDir = resolve(cwd, 'interactkit');
  const xmlFiles: string[] = [];

  try {
    for (const entry of readdirSync(interactkitDir)) {
      if (entry.endsWith('.xml')) xmlFiles.push(join(interactkitDir, entry));
    }
  } catch {
    console.error('[interactkit] No interactkit/ directory found');
    process.exit(1);
  }

  if (xmlFiles.length === 0) {
    console.error('[interactkit] No XML files found in interactkit/');
    process.exit(1);
  }

  return xmlFiles;
}

async function runCompile(cwd: string, outDir: string): Promise<void> {
  const { compile } = await import('./compiler/index.js');
  const { resolve } = await import('node:path');

  const xmlFiles = await findXmlFiles(cwd);
  console.log(`[interactkit] Compiling ${xmlFiles.length} XML file(s)...`);
  await compile(xmlFiles, resolve(cwd, outDir));
}

async function runTsc(cwd: string): Promise<void> {
  const { execSync } = await import('node:child_process');
  console.log('[interactkit] Running tsc...');
  execSync('npx tsc --noEmit', { cwd, stdio: 'inherit' });
}

// ─── compile ────────────────────────────────────────────

program
  .command('compile')
  .description('Compile XML entity graph to typed TypeScript library')
  .option('-o, --outDir <path>', 'Output directory', './interactkit/.generated')
  .action(async (opts) => {
    try {
      await runCompile(process.cwd(), opts.outDir);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
  });

// ─── build ──────────────────────────────────────────────

program
  .command('build')
  .description('Compile XML entity graph + run TypeScript compilation')
  .option('-o, --outDir <path>', 'Output directory for generated files', './interactkit/.generated')
  .action(async (opts) => {
    try {
      await runCompile(process.cwd(), opts.outDir);
      await runTsc(process.cwd());
      console.log('[interactkit] Build complete.');
    } catch (err: any) {
      if (err.message) console.error(err.message);
      process.exit(1);
    }
  });

// ─── dev ────────────────────────────────────────────────

program
  .command('dev')
  .description('Compile + run app, watching for changes (restarts on file change)')
  .option('-o, --outDir <path>', 'Output directory for generated files', './interactkit/.generated')
  .option('-e, --entry <path>', 'App entry file', './src/app.ts')
  .action(async (opts) => {
    const { resolve } = await import('node:path');
    const { spawn } = await import('node:child_process');
    const { watch } = await import('node:fs');

    const cwd = process.cwd();
    let child: ReturnType<typeof spawn> | null = null;

    async function rebuild() {
      try {
        await runCompile(cwd, opts.outDir);
      } catch (err: any) {
        console.error('[interactkit]', err.message);
        return false;
      }
      return true;
    }

    function startApp() {
      if (child) {
        child.kill();
        child = null;
      }

      const entry = resolve(cwd, opts.entry);
      console.log(`[interactkit] Starting ${opts.entry}...`);
      child = spawn('npx', ['tsx', entry], {
        cwd,
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'development' },
      });

      child.on('exit', (code) => {
        if (code !== null && code !== 0) {
          console.log(`[interactkit] Process exited with code ${code}`);
        }
        child = null;
      });
    }

    // Initial build + start
    if (await rebuild()) {
      startApp();
    }

    // Watch interactkit/ and src/ for changes
    const watchDirs = [
      resolve(cwd, 'interactkit'),
      resolve(cwd, 'src'),
    ];

    let debounce: ReturnType<typeof setTimeout> | null = null;

    for (const dir of watchDirs) {
      try {
        watch(dir, { recursive: true }, (_event, filename) => {
          if (!filename || filename.includes('.generated')) return;
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(async () => {
            console.log(`\n[interactkit] Change detected: ${filename}`);
            if (await rebuild()) {
              startApp();
            }
          }, 300);
        });
      } catch {
        // Directory might not exist
      }
    }

    // Graceful shutdown
    process.on('SIGINT', () => {
      if (child) child.kill();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      if (child) child.kill();
      process.exit(0);
    });
  });

// ─── start ──────────────────────────────────────────────

program
  .command('start')
  .description('Run the built application')
  .option('-e, --entry <path>', 'App entry file', './src/app.ts')
  .action(async (opts) => {
    const { resolve } = await import('node:path');
    const { execSync } = await import('node:child_process');

    const entry = resolve(process.cwd(), opts.entry);
    console.log(`[interactkit] Starting ${opts.entry}...`);
    try {
      execSync(`npx tsx ${entry}`, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: 'production' },
      });
    } catch {
      process.exit(1);
    }
  });

// ─── init ───────────────────────────────────────────────

program
  .command('init <name>')
  .description('Create a new InteractKit project')
  .option('--llm', 'Include an LLM entity in the scaffold')
  .action(async (name: string, opts) => {
    const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');

    const dir = join(process.cwd(), name);
    if (existsSync(dir)) {
      console.error(`[interactkit] Directory "${name}" already exists`);
      process.exit(1);
    }

    const pascal = name.replace(/(^|[-_])(\w)/g, (_: any, __: any, c: string) => c.toUpperCase());

    mkdirSync(join(dir, 'interactkit/tools'), { recursive: true });
    mkdirSync(join(dir, 'src'), { recursive: true });

    // package.json
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'interactkit dev',
        build: 'interactkit build',
        start: 'interactkit start',
      },
      dependencies: {
        '@interactkit/sdk': '^0.3.0',
      },
      devDependencies: {
        '@interactkit/cli': '^0.3.0',
        'typescript': '^5.5.0',
      },
    }, null, 2) + '\n');

    // tsconfig.json
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        skipLibCheck: true,
        esModuleInterop: true,
      },
      include: ['src/**/*.ts', 'interactkit/.generated/**/*.ts', 'interactkit/tools/**/*.ts'],
    }, null, 2) + '\n');

    // .gitignore
    writeFileSync(join(dir, '.gitignore'), [
      'node_modules/',
      'interactkit/.generated/',
      '*.db',
      '',
    ].join('\n'));

    // .vscode/settings.json — XML schema association for autocomplete
    mkdirSync(join(dir, '.vscode'), { recursive: true });
    writeFileSync(join(dir, '.vscode/settings.json'), JSON.stringify({
      'xml.fileAssociations': [
        {
          pattern: 'interactkit/**/*.xml',
          systemId: './node_modules/@interactkit/cli/schema/interactkit.xsd',
        },
      ],
    }, null, 2) + '\n');

    // entities.xml
    const llmEntity = opts.llm ? `
  <entity name="Brain" type="llm" description="LLM-powered reasoning">
    <describe>Brain</describe>
    <executor provider="openai" model="gpt-4o-mini" />
    <tools>
      <tool name="think" description="Think about a query" peerVisible="true">
        <input><param name="query" type="string" /></input>
        <output type="string" />
      </tool>
    </tools>
  </entity>
` : '';

    const brainComponent = opts.llm ? `\n      <component name="brain" entity="Brain" />` : '';

    writeFileSync(join(dir, 'interactkit/entities.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="https://interactkit.dev/schema/v1" version="1" root="${pascal}">

  <entity name="${pascal}" type="base" description="${name}">
    <describe>${pascal}</describe>${brainComponent ? `\n    <components>${brainComponent}\n    </components>` : ''}
    <state>
      <field name="count" type="number" description="Request count" default="0" />
    </state>
    <tools>
      <tool name="hello" description="Say hello" src="tools/hello.ts">
        <input><param name="name" type="string" /></input>
        <output type="string" />
      </tool>
    </tools>
  </entity>
${llmEntity}
</graph>
`);

    // tools/hello.ts
    writeFileSync(join(dir, 'interactkit/tools/hello.ts'), `import type { ${pascal}Entity, ${pascal}HelloInput } from '../.generated/types.js';

export default async (entity: ${pascal}Entity, input: ${pascal}HelloInput): Promise<string> => {
  entity.state.count++;
  return \`Hello, \${input.name}! (request #\${entity.state.count})\`;
};
`);

    // src/app.ts
    writeFileSync(join(dir, 'src/app.ts'), `import { graph } from '../interactkit/.generated/graph.js';

const store = new Map<string, Record<string, unknown>>();
const db = {
  async get(id: string) { return store.get(id) ?? null; },
  async set(id: string, state: Record<string, unknown>) { store.set(id, state); },
  async delete(id: string) { store.delete(id); },
};

const app = graph.configure({ database: db });

await app.boot();

await app.serve({ http: { port: 3000 } });
`);

    console.log(`[interactkit] Created project "${name}"`);
    console.log('');
    console.log('  Next steps:');
    console.log(`    cd ${name}`);
    console.log('    npm install');
    console.log('    npx interactkit dev');
    console.log('');
  });

program.parse();
