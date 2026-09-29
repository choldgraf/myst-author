import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mystmdMissing } from '@myst-author/preview/built';
import { startMyst } from './myst.ts';

test('reports a missing mystmd as mystmdMissing', async () => {
  process.env.MYST_BIN = '/nonexistent/myst';
  const myst = await startMyst('.');
  await assert.rejects(myst.ready, { message: mystmdMissing });
});
