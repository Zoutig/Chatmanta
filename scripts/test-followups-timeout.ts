// Verifieert het Promise.race timeout-gedrag in isolation.
// Run: npx tsx scripts/test-followups-timeout.ts

import { strict as assert } from 'node:assert';

async function slowOp(ms: number): Promise<string> {
  await new Promise((r) => setTimeout(r, ms));
  return 'done';
}

async function race(opMs: number, timeoutMs: number): Promise<string> {
  const timeoutSignal = new Promise<never>((_r, reject) => {
    setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return await Promise.race([slowOp(opMs), timeoutSignal]);
}

async function main() {
  const fast = await race(50, 500);
  assert.equal(fast, 'done');

  let rejected = false;
  try {
    await race(500, 50);
  } catch (err) {
    rejected = true;
    assert.ok(err instanceof Error);
    assert.match(err.message, /timeout 50ms/);
  }
  assert.ok(rejected, 'verwacht reject bij timeout-eerst');

  console.log('✓ Promise.race wint van timeout bij snelle op');
  console.log('✓ Promise.race rejects met timeout-error bij trage op');
}

main().catch(console.error);
