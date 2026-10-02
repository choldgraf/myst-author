import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnLsp } from './spawn.ts';

test('spawnLsp relays JSON-RPC messages as strings', async () => {
  const rootUri = pathToFileURL(mkdtempSync(join(tmpdir(), 'lsp-'))).href;
  let server!: ReturnType<typeof spawnLsp>;
  const reply = new Promise<any>((resolve) => {
    server = spawnLsp(fileURLToPath(import.meta.resolve('mystmd-lsp/dist/server.cjs')), [], (m) => {
      const message = JSON.parse(m);
      if (message.id === 1) resolve(message);
    });
  });
  server.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { processId: null, rootUri, capabilities: {} } }));
  assert.ok((await reply).result.capabilities.completionProvider);
  server.child.kill();
});
