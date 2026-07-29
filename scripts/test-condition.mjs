import { classifyCondition, mergeCondition } from '../src/lib/engine/condition.js';

const cases = [
  {
    name: 'newly refurbished',
    title: '3 bed house',
    description: 'A newly refurbished three bedroom house with a new kitchen and new bathroom. Beautifully presented throughout.',
  },
  {
    name: 'fully renovated + great potential fluff',
    title: 'Fully refurbished family home',
    description: 'This fully refurbished house offers great potential in a popular area. Replacement kitchen and bathroom. Fresh decoration throughout.',
  },
  {
    name: 'recently modernised',
    title: 'Recently modernised terrace',
    description: 'The property has been recently modernised and is move-in ready. No works required.',
  },
  {
    name: 'real doer upper',
    title: 'Investment opportunity',
    description: 'A doer-upper in need of full refurbishment. Kitchen needs replacing. Cash buyers only. Damp present.',
  },
  {
    name: 'needs modernisation',
    title: '3 bed',
    description: 'In need of modernisation throughout. Dated kitchen and tired bathroom.',
  },
];

let failed = 0;
for (const c of cases) {
  const r = classifyCondition(c);
  const merged = mergeCondition(r, {
    rooms: { decorating: 'Required', flooring: 'Needs replacing' },
    overall: 'Fair',
    notes: ['heuristic muted'],
    confidence: 'low',
    source: 'heuristic',
    imagesUsed: 2,
  });
  console.log(`${c.name} => ${r.overall} | after vision ${merged.overall} | works ${r.refurbLow}-${r.refurbHigh}`);
}

const good = classifyCondition({
  title: 'Newly refurbished house',
  description: 'Newly refurbished throughout with a replacement kitchen. Great potential location. Fresh decoration.',
});
if (good.overall !== 'Good') {
  console.error('FAIL: refurbished home should be Good, got', good.overall, good.signals);
  failed += 1;
} else {
  console.log('PASS: refurbished + marketing fluff => Good');
}

const bad = classifyCondition({
  title: 'Doer upper',
  description: 'Doer-upper in need of full refurbishment with damp.',
});
if (bad.overall !== 'Poor') {
  console.error('FAIL: doer-upper should be Poor, got', bad.overall);
  failed += 1;
} else {
  console.log('PASS: doer-upper => Poor');
}

process.exit(failed ? 1 : 0);
