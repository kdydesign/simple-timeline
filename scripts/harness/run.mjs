import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContext, verify } from './workflow.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, requested, ...extra] = process.argv.slice(2);
    if (extra.length || !['context', 'verify'].includes(action) || (action === 'verify' && requested)) {
      throw new Error('Usage: node scripts/harness/run.mjs context [stage-id] | verify');
    }
    if (action === 'context') {
      const context = getContext(repository, requested);
      console.log(JSON.stringify(context, null, 2));
      if (context.errors.length) process.exitCode = 1;
    } else if (!await verify(repository)) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
