import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const required = ['AGENTS.md', 'README.md', 'CONTEXT.md', 'docs/wayfinder/MAP.md', 'docs/wayfinder/STATUS.md'];

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

// Deliberately supports inline file links, not the entire Markdown grammar.
function prose(text) {
  let fence;
  return text.split(/\r?\n/).filter((line) => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
      return false;
    }
    return !fence;
  }).join('\n').replace(/(`+)[\s\S]*?\1/g, '');
}

export function inspectRepository(root) {
  root = resolve(root);
  const errors = [];
  for (const path of required) {
    if (!existsSync(join(root, path))) errors.push(`${path}: required document missing`);
  }
  const agents = join(root, 'AGENTS.md');
  if (existsSync(agents) && readFileSync(agents, 'utf8').split('\n').length > 150) {
    errors.push('AGENTS.md: keep entry point under 150 lines; move details into docs');
  }
  const files = [
    ...readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => join(root, entry.name)),
    ...markdownFiles(join(root, 'docs')),
  ];
  for (const file of files) {
    for (const match of prose(readFileSync(file, 'utf8')).matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
      let path;
      try { path = decodeURIComponent(target.split('#')[0]); }
      catch { errors.push(`${file}: invalid link encoding: ${target}`); continue; }
      if (!existsSync(resolve(dirname(file), path))) errors.push(`${file}: missing link target ${target}`);
    }
  }

  const stageDir = join(root, 'docs/wayfinder/stages');
  const stages = new Map();
  for (const file of markdownFiles(stageDir).sort()) {
    const text = readFileSync(file, 'utf8');
    const fields = {};
    const header = prose(text).split(/^##\s/m)[0];
    for (const match of header.matchAll(/^(id|parent|labels|status|assignee|blocked_by):[ \t]*([^\r\n]*)$/gm)) {
      if (Object.hasOwn(fields, match[1])) errors.push(`${file}: duplicate metadata field ${match[1]}`);
      fields[match[1]] = match[2].trim();
    }
    for (const key of ['id', 'parent', 'labels', 'status', 'assignee', 'blocked_by']) {
      if (!fields[key]) errors.push(`${file}: missing ${key}`);
    }
    const id = fields.id;
    if (!id) continue;
    if (id !== basename(file, '.md')) errors.push(`${file}: id must match filename`);
    if (stages.has(id)) errors.push(`${file}: duplicate stage id ${id}`);
    if (!['open', 'in_progress', 'closed'].includes(fields.status)) errors.push(`${id}: invalid status ${fields.status}`);
    if (fields.parent !== '../MAP.md') errors.push(`${id}: parent must reference ../MAP.md`);
    if (!/^wayfinder:(grilling|research|prototype|task)$/.test(fields.labels ?? '')) errors.push(`${id}: invalid label`);
    if (fields.status === 'in_progress' && fields.assignee === 'null') errors.push(`${id}: in_progress requires assignee`);
    if (fields.status === 'open' && fields.assignee && fields.assignee !== 'null') errors.push(`${id}: open stage must have null assignee`);
    const dependencies = fields.blocked_by === 'none' ? [] : (fields.blocked_by ?? '').split(',').map((value) => value.trim());
    stages.set(id, { ...fields, dependencies, title: text.match(/^# (.+)$/m)?.[1] ?? id });
  }
  if (!stages.size) errors.push('docs/wayfinder/stages: no stage tickets found');

  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`${id}: dependency cycle`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of stages.get(id).dependencies) {
      if (!stages.has(dependency)) errors.push(`${id}: unknown dependency ${dependency}`);
      else visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const [id, stage] of stages) {
    visit(id);
    if (stage.status !== 'open') {
      for (const dependency of stage.dependencies) {
        if (stages.get(dependency)?.status !== 'closed') errors.push(`${id}: dependency ${dependency} is not closed`);
      }
    }
    if (stage.status === 'closed') {
      const handoff = join(root, `docs/wayfinder/handoffs/${id}.md`);
      if (!existsSync(handoff)) errors.push(`${id}: closed stage requires handoff docs/wayfinder/handoffs/${id}.md`);
      else {
        const content = readFileSync(handoff, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
        const sections = new Map([...content.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
          .map((match) => [match[1].trim(), match[2].trim()]));
        for (const heading of ['이번 단계의 목표와 실제 결과', '사용자가 승인한 사항', '산출물', '검증', '다음 단계와 시작 문구']) {
          if (!sections.get(heading)) errors.push(`${id}: handoff requires filled section '${heading}'`);
        }
        if (!/\]\([^)]+\)/.test(prose(sections.get('산출물') ?? ''))) errors.push(`${id}: handoff 산출물 requires a link to its deliverable`);
      }
    }
  }

  const mapFile = join(root, 'docs/wayfinder/MAP.md');
  const mapText = existsSync(mapFile) ? prose(readFileSync(mapFile, 'utf8')) : '';
  const decisions = mapText.split(/^## Decisions so far\s*$/m)[1]?.split(/^##\s/m)[0] ?? '';
  const indexed = new Set([...decisions.matchAll(/\]\(stages\/([^/)]+)\.md(?:#[^)]*)?\)/g)].map((match) => match[1]));
  for (const [id, stage] of stages) {
    if (stage.status === 'closed' && !indexed.has(id)) errors.push(`MAP.md: closed stage ${id} missing from Decisions so far`);
    if (stage.status !== 'closed' && indexed.has(id)) errors.push(`MAP.md: stage ${id} is indexed as a decision but is not closed`);
  }
  for (const id of indexed) {
    if (!stages.has(id)) errors.push(`MAP.md: unknown decision stage ${id}`);
  }

  const statusFile = join(root, 'docs/wayfinder/STATUS.md');
  const statusText = existsSync(statusFile) ? prose(readFileSync(statusFile, 'utf8')) : '';
  const rows = new Map();
  for (const match of statusText.matchAll(/\|[^\n]*\]\(stages\/([^/)]+)\.md\)\s*\|\s*([^|\r\n]+)\s*\|/g)) {
    if (rows.has(match[1])) errors.push(`STATUS.md: duplicate stage row ${match[1]}`);
    rows.set(match[1], match[2].trim());
  }
  const labels = { open: ['미착수'], in_progress: ['진행 중', '사용자 확인 대기', '차단됨'], closed: ['완료'] };
  for (const [id, stage] of stages) {
    if (!labels[stage.status]?.includes(rows.get(id))) errors.push(`STATUS.md: ${id} index must match ${stage.status}`);
  }
  for (const id of rows.keys()) {
    if (!stages.has(id)) errors.push(`STATUS.md: unknown stage ${id}`);
  }
  const frontier = [...stages].filter(([, stage]) => stage.status === 'open'
    && stage.assignee === 'null'
    && stage.dependencies.every((id) => stages.get(id)?.status === 'closed'))
    .map(([id]) => id);
  return { errors, frontier: errors.length ? [] : frontier,
    stages: [...stages.values()].map((stage) => ({ ...stage, displayStatus: rows.get(stage.id) })) };
}

export function checkRepository(root) {
  const { errors, frontier } = inspectRepository(root);
  return { errors, frontier };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { errors, frontier } = checkRepository(process.argv[2] ?? '.');
    if (errors.length) {
      for (const error of errors) console.error(`ERROR: ${error}`);
      process.exitCode = 1;
    } else {
      console.log('Repository harness: OK (documents and stage contracts only)');
      console.log(`Available stages: ${frontier.join(', ') || 'none (check current claims/status)'}`);
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
