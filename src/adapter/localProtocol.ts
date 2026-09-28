import * as fs from 'fs';
import * as net from 'net';
import { randomUUID } from 'crypto';
import { ObservedEvent } from '../domain';

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 128 * 1024;
const MAX_QUEUE_LENGTH = 256;

export type AriadneAdapterState = 'connected' | 'disconnected' | 'invalid-config';

interface IpcDescriptor {
  protocol_version: number;
  endpoint: string;
  authorization_token: string;
}

interface ContextEvent {
  id: string;
  timestamp: string;
  event_type: string;
  application: { identity: string; display_name: string; executable: string };
  artifact: { kind: string; display_name: string; reference: string } | null;
  workspace: { kind: 'workspace'; display_name: string; reference: string } | null;
  location: { reference: string; line: number; column: number } | null;
  source: string;
  private_browsing: false;
}

type AdapterMessage =
  | { kind: 'hello'; protocol_version: number; adapter_id: string; adapter_version: string; capabilities: string[]; authorization_token: string }
  | { kind: 'event'; protocol_version: number; source: string; event: ContextEvent };

function frame(message: AdapterMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  if (payload.length > MAX_MESSAGE_BYTES) {throw new Error('Ariadne protocol message exceeds the size limit.');}
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

function toContextEvent(event: ObservedEvent): ContextEvent | null {
  const eventType = {
    'editor.active': 'file_focused',
    'editor.selection': 'file_focused',
    'file.edit': 'file_edited',
    'navigation.definition': 'file_focused',
    'navigation.reference': 'explicit_reference',
  }[event.type];
  if (!eventType) {return null;}
  return {
    id: randomUUID(),
    timestamp: event.timestamp,
    event_type: eventType,
    application: { identity: 'vscode', display_name: 'Visual Studio Code', executable: 'vscode' },
    artifact: event.filePath ? { kind: 'file', display_name: event.filePath, reference: event.filePath } : null,
    workspace: { kind: 'workspace', display_name: event.workspace, reference: event.workspace },
    location: event.location ? { reference: event.location.filePath, line: event.location.line, column: event.location.column } : null,
    source: 'vscode',
    private_browsing: false,
  };
}

export interface LocalAriadneAdapterOptions {
  configPath: string;
  onStateChanged?: (state: AriadneAdapterState) => void;
}

export class LocalAriadneAdapter {
  private socket: net.Socket | null = null;
  private queue: Buffer[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: LocalAriadneAdapterOptions) {}

  start(): void { this.connect(); }

  observe(event: ObservedEvent): void {
    const mapped = toContextEvent(event);
    if (!mapped) {return;}
    const message = frame({ kind: 'event', protocol_version: PROTOCOL_VERSION, source: 'vscode', event: mapped });
    if (!this.socket || this.socket.destroyed) {
      if (this.queue.length >= MAX_QUEUE_LENGTH) {this.queue.shift();}
      this.queue.push(message);
      return;
    }
    this.socket.write(message);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {clearTimeout(this.reconnectTimer);}
    this.socket?.destroy();
    this.socket = null;
  }

  private connect(): void {
    if (this.disposed) {return;}
    let descriptor: IpcDescriptor;
    try {
      descriptor = JSON.parse(fs.readFileSync(this.options.configPath, 'utf8')) as IpcDescriptor;
      if (descriptor.protocol_version !== PROTOCOL_VERSION || !descriptor.endpoint || !descriptor.authorization_token) {throw new Error('invalid descriptor');}
    } catch {
      this.options.onStateChanged?.('invalid-config');
      this.scheduleReconnect();
      return;
    }
    const socket = net.createConnection(descriptor.endpoint);
    this.socket = socket;
    socket.once('connect', () => {
      socket.write(frame({ kind: 'hello', protocol_version: PROTOCOL_VERSION, adapter_id: 'vscode', adapter_version: '0.1.0', capabilities: ['events', 'attach_reference'], authorization_token: descriptor.authorization_token }));
      this.options.onStateChanged?.('connected');
      for (const pending of this.queue.splice(0)) {socket.write(pending);}
    });
    socket.once('error', () => this.options.onStateChanged?.('disconnected'));
    socket.once('close', () => {
      if (this.socket === socket) {this.socket = null;}
      this.options.onStateChanged?.('disconnected');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) {return;}
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(); }, 1000);
  }
}

export { toContextEvent };
