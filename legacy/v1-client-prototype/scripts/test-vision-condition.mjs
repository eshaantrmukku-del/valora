/**
 * Quick test: photo analyser + merge must not leave overall Unknown when images exist.
 * Usage: node scripts/test-vision-condition.mjs
 */
import sharp from 'sharp';
import { classifyFromImageBuffers } from '../src/lib/engine/visionServer.js';
import { mergeCondition, classifyCondition } from '../src/lib/engine/condition.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    process.exit(1);
  }
  console.log('ok', msg);
}

// Synthetic "beige dated" interior
const beige = await sharp({
  create: {
    width: 128,
    height: 128,
    channels: 3,
    background: { r: 210, g: 195, b: 170 },
  },
}).jpeg().toBuffer();

// Synthetic bright white modern
const white = await sharp({
  create: {
    width: 128,
    height: 128,
    channels: 3,
    background: { r: 245, g: 245, b: 248 },
  },
}).jpeg().toBuffer();

const dated = await classifyFromImageBuffers([beige, beige, beige]);
assert(dated.ok, 'dated ok');
assert(dated.overall !== 'Unknown', `dated overall=${dated.overall}`);
assert(['Poor', 'Fair'].includes(dated.overall), `dated should need work, got ${dated.overall}`);

const modern = await classifyFromImageBuffers([white, white]);
assert(modern.ok, 'modern ok');
assert(modern.overall !== 'Unknown', `modern overall=${modern.overall}`);

const textSilent = classifyCondition({ title: '3 bed house', description: 'A lovely family home in a popular area.', epc: null });
assert(textSilent.overall === 'Unknown', `silent text=${textSilent.overall}`);

const merged = mergeCondition(textSilent, dated);
assert(merged.overall !== 'Unknown', `merged must use photos, got ${merged.overall}`);
assert(merged.vision?.imagesUsed > 0, 'vision imagesUsed set');

console.log('\nVision condition tests passed');
console.log({ dated: dated.overall, modern: modern.overall, merged: merged.overall, notes: dated.notes });
