import * as assert from 'assert';
import { createWorkspaceEventBuffer } from '../capture/eventBuffer';
import { ObservedEvent } from '../domain';

suite('Rolling Event Buffer', () => {
  const workspaceA = '/workspace-a';
  const workspaceB = '/workspace-b';
  let currentTime: number;

  function now(): number {
    return currentTime;
  }

  function makeEvent(
    type: ObservedEvent['type'],
    workspace: string,
    filePath: string,
    timestamp: number = currentTime,
  ): ObservedEvent {
    return {
      timestamp: new Date(timestamp).toISOString(),
      type,
      workspace,
      repository: workspace,
      filePath,
      location: {
        filePath,
        line: 1,
        column: 1,
      },
      source: { languageId: 'typescript' },
    };
  }

  setup(() => {
    currentTime = Date.parse('2026-01-01T00:00:00.000Z');
  });

  test('starts empty', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 1_000, now });
    assert.deepStrictEqual(buffer.getRecentEvents(), []);
    assert.strictEqual(buffer.getLastLocation(), null);
  });

  test('accepts events into the buffer', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 1_000, now });
    const event = makeEvent('editor.active', workspaceA, '/workspace-a/a.ts');

    buffer.add(event);

    assert.deepStrictEqual(buffer.getRecentEvents(), [event]);
  });

  test('removes events older than the retention window', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    buffer.add(makeEvent('editor.active', workspaceA, '/workspace-a/old.ts'));

    currentTime += 30_000;
    const recentEvent = makeEvent('file.edit', workspaceA, '/workspace-a/new.ts');
    buffer.add(recentEvent);

    currentTime += 31_000;

    assert.deepStrictEqual(buffer.getRecentEvents(), [recentEvent]);
  });

  test('returns events in chronological order', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    const newer = makeEvent('file.edit', workspaceA, '/workspace-a/newer.ts', currentTime + 20);
    const older = makeEvent('editor.active', workspaceA, '/workspace-a/older.ts', currentTime + 10);

    buffer.add(newer);
    buffer.add(older);

    assert.deepStrictEqual(buffer.getRecentEvents(), [older, newer]);
  });

  test('tracks workspace and file transitions independently', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    const eventA = makeEvent('editor.active', workspaceA, '/workspace-a/one.ts');

    currentTime += 10;
    const eventB = makeEvent('editor.active', workspaceB, '/workspace-b/two.ts');

    buffer.add(eventA);
    buffer.add(eventB);

    assert.deepStrictEqual(buffer.getRecentEvents(workspaceA), [eventA]);
    assert.deepStrictEqual(buffer.getRecentEvents(workspaceB), [eventB]);
    assert.deepStrictEqual(buffer.getRecentEvents(), [eventA, eventB]);
  });

  test('retains factual edit occurrence events', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    const editEvent = makeEvent('file.edit', workspaceA, '/workspace-a/edit.ts');

    buffer.add(editEvent);

    assert.strictEqual(buffer.getRecentEvents()[0].type, 'file.edit');
  });

  test('new buffer instances start empty after restart', () => {
    const firstBuffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    firstBuffer.add(makeEvent('editor.active', workspaceA, '/workspace-a/one.ts'));

    const restartedBuffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });

    assert.deepStrictEqual(restartedBuffer.getRecentEvents(), []);
  });

  test('preserves noisy rapid transitions without reordering them', () => {
    const buffer = createWorkspaceEventBuffer({ retentionMs: 60_000, now });
    const events = [
      makeEvent('editor.active', workspaceA, '/workspace-a/a.ts', currentTime + 1),
      makeEvent('editor.active', workspaceA, '/workspace-a/b.ts', currentTime + 2),
      makeEvent('editor.active', workspaceA, '/workspace-a/a.ts', currentTime + 3),
      makeEvent('editor.active', workspaceA, '/workspace-a/c.ts', currentTime + 4),
    ];

    for (const event of events) {
      buffer.add(event);
    }

    assert.deepStrictEqual(buffer.getRecentEvents().map((event) => event.filePath), [
      '/workspace-a/a.ts',
      '/workspace-a/b.ts',
      '/workspace-a/a.ts',
      '/workspace-a/c.ts',
    ]);
  });
});
