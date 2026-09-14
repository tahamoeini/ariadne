import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTab,
  sanitizeUrl,
  toAttachReferenceMessage,
  toNavigationMessage,
} from './privacy';

test('sanitizes HTTP(S) URLs and strips query and fragment', () => {
  assert.equal(sanitizeUrl('https://example.com/path?token=secret#part'), 'https://example.com/path');
  assert.equal(sanitizeUrl('file:///tmp/private.txt'), null);
  assert.equal(sanitizeUrl('https://user:password@example.com'), null);
});

test('rejects private browsing and excluded domains before persistence', () => {
  assert.equal(normalizeTab({ url: 'https://example.com', incognito: true }), null);
  assert.equal(normalizeTab({ url: 'https://sub.example.com', title: 'secret' }, ['example.com']), null);
});

test('normalizes navigation and explicit attach messages', () => {
  const tab = { url: 'https://docs.example.test/guide?session=secret', title: 'Guide' };
  const event = toNavigationMessage(tab, 'event-1', '2026-01-01T00:00:00Z');
  assert.equal(event?.event.artifact.reference, 'https://docs.example.test/guide');
  assert.equal(event?.event.event_type, 'browser_navigation');
  assert.deepEqual(toAttachReferenceMessage(tab), {
    kind: 'attach_reference',
    protocol_version: 1,
    source: 'browser',
    url: 'https://docs.example.test/guide',
    title: 'Guide',
  });
});
