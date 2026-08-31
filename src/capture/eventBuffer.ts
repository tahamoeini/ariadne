import { FileLocation, ObservedEvent } from '../domain';

export const DEFAULT_EVENT_RETENTION_MS = 20 * 60 * 1000;
export const DEFAULT_EVENT_BUFFER_MAX_EVENTS = 1000;

export interface EventBufferOptions {
  retentionMs?: number;
  maxEvents?: number;
  now?: () => number;
}

export interface RollingEventBuffer {
  add(event: ObservedEvent): void;
  getRecentEvents(): ObservedEvent[];
  clear(): void;
  getLastLocation(): FileLocation | null;
}

export interface WorkspaceEventBuffer {
  add(event: ObservedEvent): void;
  getRecentEvents(workspace?: string): ObservedEvent[];
  clear(workspace?: string): void;
  getLastLocation(workspace?: string): FileLocation | null;
}

function eventTimestamp(event: ObservedEvent): number {
  const timestamp = Date.parse(event.timestamp);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function compareEvents(a: ObservedEvent, b: ObservedEvent): number {
  return eventTimestamp(a) - eventTimestamp(b);
}

function cloneLocation(location: FileLocation | undefined): FileLocation | undefined {
  if (!location) {
    return undefined;
  }

  return { ...location };
}

function cloneEvent(event: ObservedEvent): ObservedEvent {
  return {
    ...event,
    location: cloneLocation(event.location),
    source: event.source ? { ...event.source } : undefined,
  };
}

export function createRollingEventBuffer(options: EventBufferOptions = {}): RollingEventBuffer {
  const retentionMs = Math.max(0, options.retentionMs ?? DEFAULT_EVENT_RETENTION_MS);
  const maxEvents = Math.max(1, options.maxEvents ?? DEFAULT_EVENT_BUFFER_MAX_EVENTS);
  const now = options.now ?? Date.now;
  let events: ObservedEvent[] = [];

  function prune(): void {
    const cutoff = now() - retentionMs;
    events = events
      .filter((event) => eventTimestamp(event) >= cutoff)
      .sort(compareEvents);

    if (events.length > maxEvents) {
      events = events.slice(-maxEvents);
    }
  }

  return {
    add(event: ObservedEvent): void {
      events.push(cloneEvent(event));
      prune();
    },
    getRecentEvents(): ObservedEvent[] {
      prune();
      return events.map(cloneEvent);
    },
    clear(): void {
      events = [];
    },
    getLastLocation(): FileLocation | null {
      prune();
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const location = cloneLocation(events[index].location);
        if (location) {
          return location;
        }
      }

      return null;
    },
  };
}

export function createWorkspaceEventBuffer(options: EventBufferOptions = {}): WorkspaceEventBuffer {
  const buffers = new Map<string, RollingEventBuffer>();

  function getOrCreateBuffer(workspace: string): RollingEventBuffer {
    const existing = buffers.get(workspace);
    if (existing) {
      return existing;
    }

    const created = createRollingEventBuffer(options);
    buffers.set(workspace, created);
    return created;
  }

  function getWorkspaceLocation(workspace: string): FileLocation | null {
    const buffer = buffers.get(workspace);
    return buffer ? buffer.getLastLocation() : null;
  }

  return {
    add(event: ObservedEvent): void {
      getOrCreateBuffer(event.workspace).add(event);
    },
    getRecentEvents(workspace?: string): ObservedEvent[] {
      if (workspace) {
        const buffer = buffers.get(workspace);
        return buffer ? buffer.getRecentEvents() : [];
      }

      return Array.from(buffers.values())
        .flatMap((buffer) => buffer.getRecentEvents())
        .sort(compareEvents);
    },
    clear(workspace?: string): void {
      if (workspace) {
        buffers.get(workspace)?.clear();
        return;
      }

      buffers.clear();
    },
    getLastLocation(workspace?: string): FileLocation | null {
      if (workspace) {
        return getWorkspaceLocation(workspace);
      }

      const lastEvent = Array.from(buffers.values())
        .flatMap((buffer) => buffer.getRecentEvents())
        .sort(compareEvents)
        .at(-1);

      return lastEvent?.location ? { ...lastEvent.location } : null;
    },
  };
}
