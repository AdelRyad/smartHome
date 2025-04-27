import TcpSocket from 'react-native-tcp-socket';
import {Buffer} from 'buffer';

interface PendingRequest {
  request: Buffer;
  resolve: (data: Buffer) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

interface ConnectionState {
  client: any;
  isConnected: boolean;
  isConnecting: boolean;
  queue: PendingRequest[];
  ip: string;
  port: number;
  reconnectAttempts: number;
  reconnectTimeout?: NodeJS.Timeout;
  watchdogTimeout?: NodeJS.Timeout;
  lastResponseTimestamp: number;
}

const RECONNECT_BASE_DELAY = 2000; // ms
const RECONNECT_MAX_DELAY = 30000; // ms
const REQUEST_TIMEOUT = 5000; // ms
const WATCHDOG_TIMEOUT = 30000; // ms

class ModbusConnectionManager {
  private connections: Map<string, ConnectionState> = new Map();
  private suspendedConnections: Set<string> = new Set();

  // Add event listeners for errors
  private errorListeners: Array<
    (ip: string, port: number, err: Error) => void
  > = [];

  public onError(listener: (ip: string, port: number, err: Error) => void) {
    this.errorListeners.push(listener);
  }

  private emitError(ip: string, port: number, err: Error) {
    for (const listener of this.errorListeners) {
      listener(ip, port, err);
    }
  }

  private getKey(ip: string, port: number) {
    return `${ip}:${port}`;
  }

  private log(...args: any[]) {
    console.log('[ModbusConnectionManager]', ...args);
  }

  public suspendConnection(ip: string, port: number) {
    const key = this.getKey(ip, port);
    this.suspendedConnections.add(key);
    const state = this.connections.get(key);
    if (state) {
      if (state.client && !state.client.destroyed) {
        state.client.destroy();
      }
      if (state.watchdogTimeout) {
        clearTimeout(state.watchdogTimeout);
        state.watchdogTimeout = undefined;
      }
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
        state.reconnectTimeout = undefined;
      }
      state.isConnected = false;
      state.isConnecting = false;
    }
    this.log(`Suspended connection to ${ip}:${port}`);
  }

  public resumeConnection(ip: string, port: number) {
    const key = this.getKey(ip, port);
    if (this.suspendedConnections.has(key)) {
      this.suspendedConnections.delete(key);
      this.log(`Resumed connection to ${ip}:${port}`);
      this.createConnection(ip, port);
    }
  }

  public isSuspended(ip: string, port: number): boolean {
    return this.suspendedConnections.has(this.getKey(ip, port));
  }

  private createConnection(ip: string, port: number) {
    const key = this.getKey(ip, port);
    if (this.suspendedConnections.has(key)) {
      this.log(
        `Connection to ${ip}:${port} is suspended, skipping createConnection.`,
      );
      return;
    }
    let state = this.connections.get(key);
    if (!state) {
      state = {
        client: null,
        isConnected: false,
        isConnecting: false,
        queue: [],
        ip,
        port,
        reconnectAttempts: 0,
        lastResponseTimestamp: Date.now(),
      };
      this.connections.set(key, state);
    }
    if (state.isConnected || state.isConnecting) return;
    this.log(`Creating connection to ${ip}:${port}`);
    state.isConnecting = true;
    state.client = TcpSocket.createConnection({host: ip, port}, () => {
      state.isConnected = true;
      state.isConnecting = false;
      state.reconnectAttempts = 0;
      this.log(`Connected to ${ip}:${port}`);
      state.lastResponseTimestamp = Date.now();
      this.startWatchdog(state);
      this.flushQueue(state);
    });
    state.client.on('data', (data: Buffer) => {
      state.lastResponseTimestamp = Date.now();
      this.startWatchdog(state);
      if (state.queue.length > 0) {
        const pending = state.queue.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(data);
        }
      }
    });
    state.client.on('error', (err: Error) => {
      this.log(`Socket error on ${ip}:${port}:`, err.message);
      this.handleDisconnect(state, err);
    });
    state.client.on('close', () => {
      this.log(`Socket closed on ${ip}:${port}`);
      this.handleDisconnect(state, new Error('Connection closed'));
    });
    this.startWatchdog(state);
  }

  private handleDisconnect(state: ConnectionState, err: Error) {
    const key = this.getKey(state.ip, state.port);
    this.emitError(state.ip, state.port, err); // Notify listeners of error
    if (this.suspendedConnections.has(key)) {
      this.log(
        `Connection to ${state.ip}:${state.port} is suspended, skipping disconnect/reconnect logic.`,
      );
      state.isConnected = false;
      state.isConnecting = false;
      if (state.client && !state.client.destroyed) {
        state.client.destroy();
      }
      if (state.watchdogTimeout) {
        clearTimeout(state.watchdogTimeout);
        state.watchdogTimeout = undefined;
      }
      while (state.queue.length > 0) {
        const pending = state.queue.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(err);
        }
      }
      return;
    }
    if (state.isConnected || state.isConnecting) {
      this.log(
        `Disconnecting from ${state.ip}:${state.port} due to error:`,
        err.message,
      );
      state.isConnected = false;
      state.isConnecting = false;
      if (state.client && !state.client.destroyed) {
        state.client.destroy();
      }
      if (state.watchdogTimeout) {
        clearTimeout(state.watchdogTimeout);
        state.watchdogTimeout = undefined;
      }
      while (state.queue.length > 0) {
        const pending = state.queue.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(err);
        }
      }
      this.scheduleReconnect(state);
    }
  }

  private scheduleReconnect(state: ConnectionState) {
    const key = this.getKey(state.ip, state.port);
    if (this.suspendedConnections.has(key)) {
      this.log(
        `Connection to ${state.ip}:${state.port} is suspended, skipping scheduleReconnect.`,
      );
      return;
    }
    if (state.reconnectAttempts >= 5) {
      this.log(
        `Too many reconnect attempts for ${state.ip}:${state.port}, suspending connection.`,
      );
      this.suspendConnection(state.ip, state.port);
      return;
    }
    if (state.reconnectTimeout) return;
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts),
      RECONNECT_MAX_DELAY,
    );
    this.log(
      `Scheduling reconnect to ${state.ip}:${
        state.port
      } in ${delay}ms (attempt ${state.reconnectAttempts + 1})`,
    );
    state.reconnectTimeout = setTimeout(() => {
      state.reconnectTimeout = undefined;
      state.reconnectAttempts++;
      this.createConnection(state.ip, state.port);
    }, delay);
  }

  private flushQueue(state: ConnectionState) {
    while (state.isConnected && state.queue.length > 0) {
      const pending = state.queue[0];
      try {
        state.client.write(
          new Uint8Array(
            pending.request.buffer,
            pending.request.byteOffset,
            pending.request.byteLength,
          ),
        );
      } catch (err) {
        this.log(
          `Write failed on ${state.ip}:${state.port}:`,
          (err as Error).message,
        );
        this.handleDisconnect(state, err as Error);
        break;
      }
      break;
    }
  }

  private startWatchdog(state: ConnectionState) {
    if (state.watchdogTimeout) {
      clearTimeout(state.watchdogTimeout);
    }
    state.watchdogTimeout = setTimeout(() => {
      const now = Date.now();
      if (now - state.lastResponseTimestamp > WATCHDOG_TIMEOUT) {
        this.log(
          `Watchdog: No response from ${state.ip}:${state.port} for ${
            WATCHDOG_TIMEOUT / 1000
          }s, forcing reconnect.`,
        );
        this.handleDisconnect(
          state,
          new Error('Watchdog timeout: No response'),
        );
      } else {
        this.startWatchdog(state); // Continue monitoring
      }
    }, WATCHDOG_TIMEOUT);
  }

  public sendRequest(
    ip: string,
    port: number,
    request: Buffer,
  ): Promise<Buffer> {
    const key = this.getKey(ip, port);
    let state = this.connections.get(key);
    if (!state) {
      this.createConnection(ip, port);
      state = this.connections.get(key)!;
    } else if (!state.isConnected && !state.isConnecting) {
      this.createConnection(ip, port);
    }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const idx = state!.queue.findIndex(p => p.timeout === timeout);
        if (idx !== -1) {
          state!.queue.splice(idx, 1);
        }
        this.log(
          `Request timed out for ${ip}:${port} - clearing queue and rejecting all pending requests.`,
        );
        // Reject all pending requests in the queue
        while (state!.queue.length > 0) {
          const pending = state!.queue.shift();
          if (pending) {
            clearTimeout(pending.timeout);
            pending.reject(
              new Error('Modbus request timed out (queue cleared)'),
            );
          }
        }
        reject(new Error('Modbus request timed out'));
        // Optionally, force a reconnect
        this.handleDisconnect(state!, new Error('Request timed out'));
      }, REQUEST_TIMEOUT);
      state!.queue.push({request, resolve, reject, timeout});
      if (state!.isConnected) {
        this.flushQueue(state!);
      }
    });
  }

  public closeAll() {
    for (const state of this.connections.values()) {
      this.log(`Force closing connection to ${state.ip}:${state.port}`);
      if (state.client && !state.client.destroyed) {
        state.client.destroy();
      }
      if (state.watchdogTimeout) {
        clearTimeout(state.watchdogTimeout);
        state.watchdogTimeout = undefined;
      }
      while (state.queue.length > 0) {
        const pending = state.queue.shift();
        if (pending) {
          clearTimeout(pending.timeout);
          pending.reject(new Error('Connection closed'));
        }
      }
      if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
        state.reconnectTimeout = undefined;
      }
      state.isConnected = false;
      state.isConnecting = false;
    }
    this.connections.clear();
  }

  public closeConnection(ip: string, port: number) {
    const key = this.getKey(ip, port);
    const state = this.connections.get(key);
    if (!state) return;
    this.log(`Force closing connection to ${state.ip}:${state.port}`);
    if (state.client && !state.client.destroyed) {
      state.client.destroy();
    }
    if (state.watchdogTimeout) {
      clearTimeout(state.watchdogTimeout);
      state.watchdogTimeout = undefined;
    }
    while (state.queue.length > 0) {
      const pending = state.queue.shift();
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Connection closed'));
      }
    }
    if (state.reconnectTimeout) {
      clearTimeout(state.reconnectTimeout);
      state.reconnectTimeout = undefined;
    }
    state.isConnected = false;
    state.isConnecting = false;
    this.connections.delete(key);
  }
}

const modbusConnectionManager = new ModbusConnectionManager();
export default modbusConnectionManager;
