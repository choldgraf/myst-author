import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { parseInventory, resolveXref, splitXref } from './xref.ts';

test('parseInventory reads a Sphinx objects.inv', () => {
  const header = '# Sphinx inventory version 2\n# Project: X\n# Version: 1\n# The remainder of this file is compressed using zlib.\n';
  const body = 'library/abc std:doc -1 library/abc.html abc — Abstract Base Classes\nabc.ABC py:class 1 library/abc.html#$ -\n';
  const entries = parseInventory(Buffer.concat([Buffer.from(header), deflateSync(body)]), 'https://docs.python.org/3/');
  assert.deepEqual(entries, [
    { name: 'library/abc', kind: 'std:doc', title: 'abc — Abstract Base Classes', url: 'https://docs.python.org/3/library/abc.html' },
    { name: 'abc.ABC', kind: 'py:class', title: 'abc.ABC', url: 'https://docs.python.org/3/library/abc.html#abc.ABC' },
  ]);
  const project = { url: 'https://docs.python.org/3/', kind: 'sphinx' as const, entries };
  const { page, hash } = splitXref('python#abc.ABC');
  assert.equal(resolveXref(project, page, hash)?.kind, 'py:class');
  assert.equal(resolveXref(project, '', 'nope'), undefined);
});
