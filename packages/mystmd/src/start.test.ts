import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mystmdMissing } from './built.ts';
import { startMyst } from './start.ts';

test('reports a missing mystmd as mystmdMissing', async () => {
  process.env.MYST_BIN = '/nonexistent/myst';
  const myst = await startMyst('.');
  await assert.rejects(myst.ready, { message: mystmdMissing });
});
