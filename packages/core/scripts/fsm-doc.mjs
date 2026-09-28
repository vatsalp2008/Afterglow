// Generates docs/gesture-fsm.md from the pen and tool gesture transition tables.
//   node scripts/fsm-doc.mjs          write the doc
//   node scripts/fsm-doc.mjs --check  exit 1 if the committed doc is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PEN_TRANSITIONS, penFsmMermaid } from '../src/gesture/pinch.ts';
import { TOOL_TRANSITIONS, toolFsmMermaid } from '../src/gesture/tools.ts';

const out = fileURLToPath(new URL('../../../docs/gesture-fsm.md', import.meta.url));

const table = (transitions) =>
  transitions.map((r) => {
    const guard = r.confirmed === undefined ? '' : r.confirmed ? 'confirmed' : 'not yet';
    return `| ${r.from} | ${r.input} | ${guard} | ${r.to} | ${r.actions.join(', ') || 'none'} |`;
  });
const rows = table(PEN_TRANSITIONS);
const toolRows = table(TOOL_TRANSITIONS);

const doc = `# Gesture state machines

Generated from \`PEN_TRANSITIONS\` in [\`packages/core/src/gesture/pinch.ts\`](../packages/core/src/gesture/pinch.ts) and \`TOOL_TRANSITIONS\` in [\`packages/core/src/gesture/tools.ts\`](../packages/core/src/gesture/tools.ts) by \`pnpm --filter @afterglow/core docs:fsm\`. Don't edit by hand; CI fails if this file is stale.

## Pen

One state machine runs per tracked hand. Each frame, the pinch measure is classified as **closed** (below \`enter\`), **open** (above \`exit\`), or **between** (in the hysteresis band). **lost** means the hand has been missing for longer than the loss grace. The \`pressing\` and \`releasing\` states wait for confirmation: \`enterFrames\` closed frames to start a stroke; \`exitFrames\` open frames, and at least \`exitMs\`, to end one.

\`\`\`mermaid
${penFsmMermaid().trimEnd()}
\`\`\`

Hover-only self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

Actions: **start** and **move** emit stroke events; **hold** keeps a sample back while the fingers may be opening; **flush** emits the held samples when it turns out not to be a release; **release** drops them and ends the stroke; **lose** ends the stroke because the hand is gone.

## Tool gestures

One state machine runs for all hands. Each frame, the hands are reduced to at most one candidate gesture: a held open palm (openMenu), a fist (pause), two fingers up (swipes for undo and redo), or both hands framing (refine). The input is **same** when it's the gesture already being held, on the same hands; **other** for a different one, or an open palm that moved or changed shape, which restarts the hold; **none** when there's no candidate for longer than \`gapMs\`; and **drawing** while any hand draws. \`holding\` is confirmed once the gesture's hold time has passed, and \`cooling\` once \`cooldownMs\` has.

\`\`\`mermaid
${toolFsmMermaid().trimEnd()}
\`\`\`

Waiting self-loops are omitted from the diagram. The full table:

| From | Input | Confirmation | To | Actions |
| --- | --- | --- | --- | --- |
${toolRows.join('\n')}

Actions: **begin** starts holding the frame's candidate; **activate** fires a held gesture (for two fingers up, it arms swipes instead); **track** fires undo or redo for each swipe while two fingers stay up; **cool** starts the cooldown once the pose ends; **clear** drops the candidate.
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
