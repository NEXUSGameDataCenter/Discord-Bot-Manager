// Static checks for code whose dependencies cannot be installed in this sandbox.
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = process.argv[2];
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (f === 'node_modules' || f === '.next') continue; fs.statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && files.push(p); } })(root);
let problems = 0;
const fail = (m) => { problems++; console.log('  ✗', m); };

// 1. Syntax of every file
let parsed = 0;
for (const f of files) {
  if (f.endsWith(".d.ts")) { parsed++; continue; }
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { fileName: f, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  for (const d of out.diagnostics ?? []) fail(`syntax ${path.relative(root, f)}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  parsed++;
}
console.log(`[1] syntax: ${parsed} files parsed`);

// 2. Named imports from @nexus/shared must exist
const sharedSrc = fs.readdirSync(path.join(root, 'packages/shared/src')).map((f) => fs.readFileSync(path.join(root, 'packages/shared/src', f), 'utf8')).join('\n');
const exported = new Set([...sharedSrc.matchAll(/export (?:declare )?(?:const|function|type|interface|class|async function)\s+(\w+)/g)].map((m) => m[1]));
let imports = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'@nexus\/shared(\/crypto)?'/g)) {
    for (const raw of m[1].split(',')) { const n = raw.replace(/^\s*type\s+/, '').split(' as ')[0].trim(); if (!n) continue; imports++; if (!exported.has(n)) fail(`${path.relative(root, f)} imports missing "${n}" from @nexus/shared`); }
  }
}
console.log(`[2] @nexus/shared imports: ${imports} names resolved`);

// 3. Local relative/alias imports resolve to files
let rel = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/from\s+'((?:\.{1,2}|@)\/[^']+)'/g)) {
    let spec = m[1];
    const base = spec.startsWith('@/') ? path.join(root, 'apps/web/src', spec.slice(2)) : path.resolve(path.dirname(f), spec);
    rel++;
    if (!['.ts', '.tsx', '/index.ts', ''].some((e) => fs.existsSync(base + e) && fs.statSync(base + e).isFile())) fail(`${path.relative(root, f)}: cannot resolve ${spec}`);
  }
}
console.log(`[3] local imports: ${rel} resolved`);

// 4. Next.js route files only export allowed names
const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'dynamic', 'runtime', 'revalidate', 'fetchCache', 'preferredRegion', 'maxDuration']);
let routes = 0;
for (const f of files.filter((f) => /\/app\/.*\/route\.ts$/.test(f))) {
  routes++;
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/export\s+(?:const|async function|function)\s+(\w+)/g)) if (!allowed.has(m[1])) fail(`${path.relative(root, f)} exports non-route name ${m[1]}`);
  for (const m of src.matchAll(/export\s+const\s+\{([^}]+)\}/g)) for (const n of m[1].split(',').map((s) => s.trim())) if (!allowed.has(n)) fail(`${path.relative(root, f)} exports ${n}`);
  if (!/route\(|routeAs\(|requireUser\(|handlers/.test(src)) fail(`${path.relative(root, f)} has no auth guard`);
}
console.log(`[4] route files: ${routes} checked (exports + auth guard)`);

// 5. Client bundles never import server-only code or secrets
let clients = 0;
for (const f of files.filter((f) => f.includes('apps/web'))) {
  const src = fs.readFileSync(f, 'utf8');
  if (!src.startsWith("'use client'")) continue;
  clients++;
  if (/from '(@nexus\/db|@nexus\/shared\/crypto|@\/lib\/server\/[^']+|bullmq|ioredis|node:[^']+)'/.test(src)) fail(`client file ${path.relative(root, f)} imports server-only module`);
  if (/tokenEnc|ENCRYPTION_KEY|AUTH_SECRET/.test(src)) fail(`client file ${path.relative(root, f)} references a secret`);
}
console.log(`[5] client components: ${clients} checked for server/secret imports`);

// 6. tokenEnc only touched where expected
for (const f of files.filter((f) => f.includes('apps/web'))) {
  const src = fs.readFileSync(f, 'utf8');
  if (/tokenEnc/.test(src) && !f.endsWith('api/bots/route.ts') && !/redact/.test(src)) fail(`${path.relative(root, f)} touches tokenEnc`);
}
const botsRoute = fs.readFileSync(path.join(root, 'apps/web/src/app/api/bots/route.ts'), 'utf8');
if (!/select:\s*botSelect/.test(botsRoute) || /tokenEnc:\s*true/.test(botsRoute)) fail('bots GET may expose tokenEnc');
console.log('[6] tokenEnc confined to encrypt-on-write in api/bots');

// 7. Prisma: every relation type refers to a model, every @relation field exists
const schema = fs.readFileSync(path.join(root, 'packages/db/prisma/schema.prisma'), 'utf8');
const models = new Map([...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map((m) => [m[1], m[2]]));
const enums = new Set([...schema.matchAll(/enum (\w+) \{/g)].map((m) => m[1]));
const scalars = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Json', 'Float', 'BigInt', 'Decimal', 'Bytes']);
for (const [name, body] of models) for (const line of body.split('\n')) {
  const m = line.trim().match(/^(\w+)\s+(\w+)(\[\]|\?)?/);
  if (!m || line.trim().startsWith('//') || line.trim().startsWith('@@')) continue;
  const type = m[2];
  if (!scalars.has(type) && !enums.has(type) && !models.has(type)) fail(`prisma ${name}.${m[1]}: unknown type ${type}`);
  const rel = line.match(/fields: \[(\w+)\]/);
  if (rel && !new RegExp(`^\\s*${rel[1]}\\s`, 'm').test(body)) fail(`prisma ${name}: relation field ${rel[1]} missing`);
}
console.log(`[7] prisma: ${models.size} models, ${enums.size} enums cross-checked`);

// 8. Every prisma model accessor used in code exists
const accessors = new Set([...models.keys()].map((m) => m[0].toLowerCase() + m.slice(1)));
for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/prisma\.(\w+)\./g)) if (!m[1].startsWith('$') && !accessors.has(m[1])) fail(`${path.relative(root, f)} uses unknown prisma.${m[1]}`);
console.log('[8] prisma accessors match models');

console.log(problems ? `\nSTATIC CHECKS: ${problems} problem(s)` : '\nSTATIC CHECKS: all passed');
process.exitCode = problems ? 1 : 0;
