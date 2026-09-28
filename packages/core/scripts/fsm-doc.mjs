// Generates docs/gesture-fsm.md from the pen state machine's transition table.
//   node scripts/fsm-doc.mjs          write the doc
//   node scripts/fsm-doc.mjs --check  exit 1 if the committed doc is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PEN_TRANSITIONS, penFsmMermaid } from '../src/gesture/pinch.ts';

const out = fileURLToPath(new URL('../../../docs/gesture-fsm.md', import.meta.url));

const rows = PEN_TRANSITIONS.map((r) => {
  const guard = r.confirmed === undefined ? '' : r.confirmed ? 'confirmed' : 'not yet';
  return `| ${r.from} | ${r.input} | ${guard} | ${r.to} | ${r.actions.join(', ') || 'none'} |`;
});

const doc = `# Pen state machine

Generated from \`PEN_TRANSITIONS\` in [\`packages/core/src/gesture/pinch.ts\`](../packages/core/src/gesture/pinch.ts) by \`pnpm --filter @afterglow/core docs:fsm\`. Don't edit by hand; CI fails if this file is stale.

One state machine runs per tracked hand. Each frame, the pinch measure is classified as **closed** (below \`enter\`), **open** (above \`exit\`), or **between** (in the hysteresis band). **lost** means the hand has been missing for longer than the loss grace. The \`pressing\` and \`releasing\` states wait for confirmation: \`enterFrames\` closed frames to start a stroke; \`exitFrames\` open frames, and at least \`exitMs\`, to end one.

\`\`\`mermaid
${penFsmMermaid().trimEnd()}
\`\`\`

Hover-only self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

Actions: **start** and **move** emit stroke events; **hold** keeps a sample back while the fingers may be opening; **flush** emits the held samples when it turns out not to be a release; **release** drops them and ends the stroke; **lose** ends the stroke because the hand is gone.
`;

if (process.argv.includes('--check')) {
  const current = readFileSync(out, 'utf8');
  if (current !== doc) {
    console.error('docs/gesture-fsm.md is stale. Run: pnpm --filter @afterglow/core docs:fsm');
    process.exit(1);
  }
  console.log('docs/gesture-fsm.md is up to date');
} else {
  writeFileSync(out, doc);
  console.log(`wrote ${out}`);
}
