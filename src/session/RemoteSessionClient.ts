import { z } from "zod";
import type { Aar } from "../engine/aar";
import type { SessionLog } from "../engine/types";
import type { TraineeView } from "../engine/view";
import {
  clientIntentSchema,
  networkAarSchema,
  serverMessageSchema,
} from "./protocol";
import type { NetworkSessionView } from "./protocol";
import type {
  InstructorDiagnostics,
  SessionClient,
  SessionCommand,
} from "./SessionClient";

const credentialSchema = z.strictObject({
  code: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  clientId: z.string().uuid(),
  token: z.string().regex(/^[0-9a-f]{32}$/),
  role: z.enum(["INSTRUCTOR", "COMMANDER", "ANALYST"]),
  scenarioId: z.string().min(1),
  seed: z.number().int(),
  difficultyLevel: z.number().int().min(1).max(5),
});

export type RemoteCredential = z.infer<typeof credentialSchema>;
export type RemoteStatus =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "FALLBACK_AVAILABLE"
  | "FAILED"
  | "COMPLETE";

export interface RemoteSessionOptions {
  code: string;
  role: "INSTRUCTOR" | "COMMANDER" | "ANALYST";
  name: string;
  credential?: RemoteCredential;
  socketFactory?: (url: string) => WebSocket;
}

export class RemoteSessionClient implements SessionClient {
  readonly code: string;
  readonly role: RemoteSessionOptions["role"];
  readonly name: string;
  private readonly socketFactory: (url: string) => WebSocket;
  private readonly listeners = new Set<() => void>();
  private readonly statusListeners = new Set<() => void>();
  private socket: WebSocket | null = null;
  private view: NetworkSessionView | null = null;
  private credentials: RemoteCredential | undefined;
  private statusValue: RemoteStatus = "CONNECTING";
  private messageValue = "Connecting to the authoritative session…";
  private lastSequence = -1;
  private failedConnections = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private disposed = false;
  private terminalError = false;
  private readySettled = false;
  private resolveReady!: (client: RemoteSessionClient) => void;
  private rejectReady!: (error: Error) => void;
  readonly ready: Promise<RemoteSessionClient>;

  private constructor(options: RemoteSessionOptions) {
    this.code = options.code;
    this.role = options.role;
    this.name = options.name;
    this.credentials = options.credential;
    this.socketFactory = options.socketFactory ?? ((url) => new WebSocket(url));
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    if (!this.credentials) {
      const stored = readCredential(this.code, this.role);
      if (stored) this.credentials = stored;
    }
    this.connect();
  }

  static join(options: RemoteSessionOptions): RemoteSessionClient {
    if (
      !/^[A-HJ-NP-Z2-9]{6}$/.test(options.code) ||
      options.name.trim().length < 2 ||
      options.name.trim().length > 40
    ) {
      throw new TypeError("Session code or display name is invalid.");
    }
    return new RemoteSessionClient(options);
  }

  static resume(code: string): RemoteSessionClient | null {
    for (const role of ["INSTRUCTOR", "COMMANDER", "ANALYST"] as const) {
      const credential = readCredential(code, role);
      if (!credential) continue;
      return new RemoteSessionClient({
        code,
        role,
        name: readName(code, role) ?? role.toLowerCase(),
        credential,
      });
    }
    return null;
  }

  static async create(input: {
    scenarioId: string;
    seed?: number;
    difficultyLevel?: number;
    aidMode?: "ALWAYS" | "AFTER_ESTIMATE";
    name: string;
  }): Promise<RemoteSessionClient> {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scenarioId: input.scenarioId,
        ...(input.seed === undefined ? {} : { seed: input.seed }),
        ...(input.difficultyLevel === undefined
          ? {}
          : { difficultyLevel: input.difficultyLevel }),
        ...(input.aidMode === undefined ? {} : { aidMode: input.aidMode }),
      }),
    });
    if (!response.ok) {
      const error = await readApiError(response);
      throw new Error(error);
    }
    const credential = credentialSchema.safeParse(await response.json());
    if (!credential.success) {
      throw new Error(
        "The session service returned an invalid creation response.",
      );
    }
    const client = RemoteSessionClient.join({
      code: credential.data.code,
      role: "INSTRUCTOR",
      name: input.name,
      credential: credential.data,
    });
    await client.ready;
    return client;
  }

  get status(): RemoteStatus {
    return this.statusValue;
  }

  get statusMessage(): string {
    return this.messageValue;
  }

  getSnapshot(): NetworkSessionView {
    if (!this.view)
      throw new Error("The authoritative session view is not ready.");
    return this.view;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  dispatch(command: SessionCommand): void {
    if (
      this.statusValue !== "CONNECTED" ||
      this.socket?.readyState !== WebSocket.OPEN
    ) {
      this.setStatus(
        this.failedConnections >= 3 ? "FALLBACK_AVAILABLE" : "RECONNECTING",
        "The action was not sent because the authoritative connection is unavailable.",
      );
      return;
    }
    const intent = clientIntentSchema.safeParse(command);
    if (!intent.success) {
      throw new TypeError(
        "Action does not match the network session protocol.",
      );
    }
    this.socket.send(JSON.stringify({ type: "INTENT", intent: intent.data }));
  }

  advanceToSeconds(_tSec: number): void {
    throw new Error(
      "Network session time is advanced only by the authoritative server.",
    );
  }

  getNextScheduledEventAtSec(): number | null {
    throw new Error("Scheduled server events are not exposed to participants.");
  }

  getLog(): SessionLog {
    throw new Error(
      "Network session logs are available only through the authorized AAR.",
    );
  }

  getAar(): Aar {
    throw new Error(
      "Use the authorized network AAR endpoint for this session.",
    );
  }

  getInstructorDiagnostics(_showTruth = false): InstructorDiagnostics {
    throw new Error(
      "Network instructor monitoring uses the server-projected monitor view.",
    );
  }

  getCredential(): RemoteCredential {
    if (!this.credentials) {
      throw new Error("Reconnect credentials are not available.");
    }
    return this.credentials;
  }

  async fetchAar(): Promise<Aar> {
    if (this.statusValue !== "COMPLETE") {
      throw new Error(
        "The team AAR is available only after exercise completion.",
      );
    }
    const credential = this.getCredential();
    const response = await fetch(`/api/sessions/${this.code}/aar`, {
      headers: { authorization: `Bearer ${credential.token}` },
    });
    if (!response.ok) throw new Error(await readApiError(response));
    const parsed = networkAarSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new Error("The session service returned an invalid team AAR.");
    }
    return parsed.data;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.socket?.close(1000, "Session client disposed");
    this.socket = null;
    this.listeners.clear();
    this.statusListeners.clear();
  }

  private connect(): void {
    if (this.disposed || this.terminalError) return;
    this.setStatus(
      this.failedConnections === 0 ? "CONNECTING" : "RECONNECTING",
      this.failedConnections === 0
        ? "Connecting to the authoritative session…"
        : `Reconnecting… attempt ${this.failedConnections + 1}`,
    );
    const url = new URL("/ws", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket;
    try {
      socket = this.socketFactory(url.toString());
    } catch {
      this.connectionFailed("The network session could not be opened.");
      return;
    }
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.disposed) return;
      this.heartbeatTimer = window.setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "PING", ts: Date.now() }));
        }
      }, 20_000);
      socket.send(
        JSON.stringify({
          type: "HELLO",
          code: this.code,
          role: this.role,
          name: this.name,
          ...(this.credentials
            ? {
                clientId: this.credentials.clientId,
                token: this.credentials.token,
              }
            : {}),
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || this.disposed) return;
      this.receive(event.data);
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) {
        this.messageValue = "Connection interrupted; trying to reconnect.";
        this.emitStatus();
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket || this.disposed) return;
      if (this.heartbeatTimer !== null)
        window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      this.connectionFailed("Connection closed. Reconnecting…");
    });
  }

  private receive(data: unknown): void {
    if (typeof data !== "string") {
      this.fail("The server sent an invalid session update.");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data);
    } catch {
      this.fail("The server sent a malformed session update.");
      return;
    }
    const parsed = serverMessageSchema.safeParse(raw);
    if (!parsed.success) {
      this.fail("The server sent an invalid session update.");
      return;
    }
    const message = parsed.data;
    if (message.type === "PONG") return;
    if (message.type === "ERROR") {
      const fatal = [
        "SESSION_NOT_FOUND",
        "ROLE_TAKEN",
        "BAD_TOKEN",
        "FORBIDDEN",
        "SESSION_FINISHED",
      ].includes(message.code);
      if (fatal) {
        this.fail(message.message);
        this.socket?.close(1008, message.code);
      } else {
        this.messageValue = message.message;
        this.emitStatus();
      }
      return;
    }
    const view = message.view;
    if (this.view && view.seq <= this.lastSequence) return;
    if (view.role !== this.role) {
      this.fail("The server returned a view for a different participant role.");
      this.socket?.close(1008, "Role mismatch");
      return;
    }
    this.lastSequence = view.seq;
    this.view = view;
    if (message.type === "WELCOME") {
      if (message.role !== this.role) {
        this.fail("The session assigned a different participant role.");
        this.socket?.close(1008, "Role mismatch");
        return;
      }
      this.credentials = {
        code: this.code,
        clientId: message.clientId,
        token: message.token,
        role: this.role,
        scenarioId: view.scenario.id,
        seed: this.credentials?.seed ?? 0,
        difficultyLevel: view.scenario.difficulty,
      };
      const credentialSaved = writeCredential(this.credentials, this.name);
      this.failedConnections = 0;
      this.setStatus(
        view.phase === "COMPLETE" ? "COMPLETE" : "CONNECTED",
        !credentialSaved
          ? "Connected, but browser storage is unavailable; reconnect details were not saved."
          : view.phase === "COMPLETE"
            ? "Exercise complete. Open the team after-action review."
            : "Connected to the authoritative session.",
      );
      if (!this.readySettled) {
        this.readySettled = true;
        this.resolveReady(this);
      }
    } else {
      this.setStatus(
        view.phase === "COMPLETE" ? "COMPLETE" : "CONNECTED",
        view.phase === "COMPLETE"
          ? "Exercise complete. Open the team after-action review."
          : "Connected to the authoritative session.",
      );
    }
    this.listeners.forEach((listener) => listener());
  }

  private connectionFailed(message: string): void {
    if (this.disposed || this.terminalError) return;
    this.failedConnections += 1;
    this.messageValue =
      this.failedConnections >= 3
        ? "Connection unavailable — you can continue in a fresh local session."
        : message;
    this.setStatus(
      this.failedConnections >= 3 ? "FALLBACK_AVAILABLE" : "RECONNECTING",
      this.messageValue,
    );
    if (!this.readySettled && this.failedConnections >= 3) {
      this.readySettled = true;
      this.rejectReady(new Error(this.messageValue));
    }
    const backoff = [500, 1000, 2000, 4000, 8000];
    const delay =
      backoff[Math.min(this.failedConnections - 1, backoff.length - 1)]!;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private fail(message: string): void {
    this.terminalError = true;
    this.setStatus("FAILED", message);
    if (!this.readySettled) {
      this.readySettled = true;
      this.rejectReady(new Error(message));
    }
  }

  private setStatus(status: RemoteStatus, message: string): void {
    this.statusValue = status;
    this.messageValue = message;
    this.emitStatus();
  }

  private emitStatus(): void {
    this.statusListeners.forEach((listener) => listener());
  }
}

function credentialKey(code: string, role: RemoteCredential["role"]): string {
  return `dhundh.v1.reconnect.${code}.${role}`;
}

function nameKey(code: string, role: RemoteCredential["role"]): string {
  return `${credentialKey(code, role)}.name`;
}

function readCredential(
  code: string,
  role: RemoteCredential["role"],
): RemoteCredential | undefined {
  try {
    const raw = sessionStorage.getItem(credentialKey(code, role));
    if (!raw) return undefined;
    const result = credentialSchema.safeParse(JSON.parse(raw));
    return result.success && result.data.code === code
      ? result.data
      : undefined;
  } catch {
    return undefined;
  }
}

function readName(
  code: string,
  role: RemoteCredential["role"],
): string | undefined {
  try {
    const name = sessionStorage.getItem(nameKey(code, role));
    return name && name.length >= 2 && name.length <= 40 ? name : undefined;
  } catch {
    return undefined;
  }
}

function writeCredential(credential: RemoteCredential, name: string): boolean {
  try {
    sessionStorage.setItem(
      credentialKey(credential.code, credential.role),
      JSON.stringify(credential),
    );
    sessionStorage.setItem(nameKey(credential.code, credential.role), name);
    return true;
  } catch {
    return false;
  }
}

async function readApiError(response: Response): Promise<string> {
  const result = z
    .strictObject({
      error: z.strictObject({ code: z.string(), message: z.string() }),
    })
    .safeParse(await response.json().catch(() => null));
  return result.success
    ? result.data.error.message
    : "The session service is unavailable. Try again later.";
}
