import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mystmdMissing } from './built.ts';
import { startMyst } from './start.ts';

test('reports a missing mystmd as mystmdMissing', async () => {
  process.env.MYST_BIN = '/nonexistent/myst';
  const myst = await startMyst('.');
  await assert.rejects(myst.ready, { message: mystmdMissing });
});

test('exited rejects when mystmd dies after it is ready', async () => {
  const bin = join(mkdtempSync(join(tmpdir(), 'myst-')), 'myst');
  writeFileSync(bin, '#!/bin/sh\necho "Content server started"\nexit 3\n');
  chmodSync(bin, 0o755);
  process.env.MYST_BIN = bin;
  const myst = await startMyst('.', () => {});
  await myst.ready;
  await assert.rejects(myst.exited, { message: 'myst exited with code 3' });
});
