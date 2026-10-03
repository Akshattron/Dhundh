import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { WebSocket, WebSocketServer } from "ws";
import { buildAar } from "../src/engine/aar";
import { buildTeamAar } from "./teamAar";
import { scenarios } from "../src/scenarios";
import {
  clientMessageSchema,
  serverMessageSchema,
} from "../src/session/protocol";
import { config } from "./config.ts";
import {
  publicSession,
  SessionFault,
  SessionManager,
  type ManagedSession,
  type Participant,
} from "./sessions.ts";

const sessionInputSchema = express.json({ limit: "8kb", strict: true });
const createBodySchema = z.strictObject({
  scenarioId: z.string().min(1).max(120),
  seed: z.number().int().safe().optional(),
  difficultyLevel: z.number().int().min(1).max(5).optional(),
  aidMode: z.enum(["ALWAYS", "AFTER_ESTIMATE"]).optional(),
});
const manager = new SessionManager(scenarios, {
  maxSessions: config.maxSessions,
  ttlMs: config.sessionTtlMs,
});
const createRates = new Map<string, number[]>();

const app = express();
app.disable("x-powered-by");
app.use(sessionInputSchema);

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    version: config.version,
    uptimeSec: Math.floor(process.uptime()),
    sessions: manager.size,
  });
});

app.get("/api/scenarios", (_request, response) => {
  response.json(
    scenarios.map((scenario) => ({
      id: scenario.meta.id,
      title: scenario.meta.title,
      subtitle: scenario.meta.subtitle,
      difficulty: scenario.meta.difficulty,
      summary: scenario.meta.summary,
      tags: scenario.meta.tags,
      durationMin: scenario.meta.durationSec / 60,
    })),
  );
});

app.post("/api/sessions", (request, response) => {
  const ip = request.ip ?? "unknown";
  const now = Date.now();
  const attempts = (createRates.get(ip) ?? []).filter(
    (time) => now - time < 60_000,
  );
  if (attempts.length >= 30) {
    createRates.set(ip, attempts);
    response.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many session requests. Try again shortly.",
      },
    });
    return;
  }
  attempts.push(now);
  createRates.set(ip, attempts);
  if (createRates.size > 1000) {
    for (const [address, times] of createRates) {
      if (!times.some((time) => now - time < 60_000))
        createRates.delete(address);
    }
  }

  const parsed = createBodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: { code: "INVALID_BODY", message: "Session settings are invalid." },
    });
    return;
  }
  const input = parsed.data;
  const scenario = scenarios.find(
    (candidate) => candidate.meta.id === input.scenarioId,
  );
  if (!scenario) {
    response.status(404).json({
      error: {
        code: "UNKNOWN_SCENARIO",
        message: "That synthetic scenario is unavailable.",
      },
    });
    return;
  }
  try {
    const { credential } = manager.create({
      scenarioId: input.scenarioId,
      seed: input.seed ?? 0,
      difficultyLevel: input.difficultyLevel ?? scenario.meta.difficulty,
      aidMode: input.aidMode ?? "ALWAYS",
    });
    response.status(201).json(credential);
  } catch (error) {
    if (error instanceof SessionFault && error.code === "TOO_MANY_SESSIONS") {
      response.status(429).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    throw error;
  }
});

app.get("/api/sessions/:code", (request, response) => {
  const code = request.params.code;
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    response.status(404).json({
      error: {
        code: "SESSION_NOT_FOUND",
        message: "Session code was not found.",
      },
    });
    return;
  }
  const session = manager.find(code);
  if (!session) {
    response.status(404).json({
      error: {
        code: "SESSION_NOT_FOUND",
        message: "Session code was not found.",
      },
    });
    return;
  }
  response.json(publicSession(session));
});

app.get("/api/sessions/:code/aar", (request, response) => {
  const code = request.params.code;
  const session = manager.find(code);
  if (!session) {
    response.status(404).json({
      error: {
        code: "SESSION_NOT_FOUND",
        message: "Session code was not found.",
      },
    });
    return;
  }
  const authorization = request.header("authorization") ?? "";
  const match = /^Bearer ([0-9a-f]{32})$/.exec(authorization);
  const authorizedParticipant = [...session.clients.values()].find(
    (client) => client.token === match?.[1],
  );
  if (!authorizedParticipant) {
    response.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "A session participant credential is required.",
      },
    });
    return;
  }
  if (session.state.phase !== "COMPLETE") {
    response.status(409).json({
      error: { code: "NOT_COMPLETE", message: "The exercise is not complete." },
    });
    return;
  }
  response.json(buildTeamAar(buildAar(session.scenario, session.log), session));
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (
      error instanceof SyntaxError ||
      (typeof error === "object" &&
        error !== null &&
        "type" in error &&
        error.type === "entity.too.large")
    ) {
      response.status(400).json({
        error: {
          code: "INVALID_BODY",
          message: "Request body is malformed or too large.",
        },
      });
      return;
    }
    console.error("HTTP_ERROR", {
      name: error instanceof Error ? error.name : "UNKNOWN",
    });
    response.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "The server could not complete the request.",
      },
    });
  },
);

app.use(["/api", "/health"], (_request, response) => {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "No application endpoint is implemented at this path.",
    },
  });
});

if (config.production) {
  const dist = fileURLToPath(new URL("../dist", import.meta.url));
  app.use(express.static(dist));
  app.get("/{*path}", (_request, response) => {
    response.sendFile("index.html", { root: dist });
  });
}

const server = createServer(app);
const sockets = new WebSocketServer({
  server,
  path: "/ws",
  maxPayload: 8 * 1024,
});

function send(socket: WebSocket, message: unknown): void {
  const parsed = serverMessageSchema.safeParse(message);
  if (!parsed.success) {
    console.error("WEBSOCKET_OUTBOUND_INVALID", {
      messageType:
        typeof message === "object" && message !== null && "type" in message
          ? String(message.type)
          : "UNKNOWN",
    });
    socket.close(1011, "The session update could not be sent.");
    return;
  }
  const serialized = JSON.stringify(parsed.data);
  if (Buffer.byteLength(serialized, "utf8") > 40 * 1024) {
    console.error("WEBSOCKET_VIEW_TOO_LARGE", {
      bytes: Buffer.byteLength(serialized, "utf8"),
    });
    socket.close(1011, "The session update exceeded its safe size.");
    return;
  }
  if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
}

function broadcast(session: ManagedSession): void {
  for (const participant of session.clients.values()) {
    if (!participant.socket) continue;
    send(participant.socket, {
      type: "VIEW",
      view: manager.view(session, participant),
    });
  }
}

sockets.on("connection", (socket) => {
  let participant: Participant | null = null;
  const helloTimeout = setTimeout(() => {
    if (participant) return;
    send(socket, {
      type: "ERROR",
      code: "BAD_MESSAGE",
      message: "A valid session HELLO was not received.",
    });
    socket.close(4001, "HELLO required");
  }, 5000);

  socket.on("error", (error: NodeJS.ErrnoException) => {
    console.error("WEBSOCKET_ERROR", { code: error.code ?? "UNKNOWN" });
  });

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      send(socket, {
        type: "ERROR",
        code: "BAD_MESSAGE",
        message: "Only JSON text messages are accepted.",
      });
      socket.close(1003, "Text messages required");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString("utf8"));
    } catch {
      send(socket, {
        type: "ERROR",
        code: "BAD_MESSAGE",
        message: "Message must be valid JSON.",
      });
      socket.close(1007, "Malformed JSON");
      return;
    }
    const parsed = clientMessageSchema.safeParse(raw);
    if (!parsed.success) {
      send(socket, {
        type: "ERROR",
        code: "BAD_MESSAGE",
        message: "Message does not match the session protocol.",
      });
      return;
    }
    const message = parsed.data;
    if (!participant) {
      if (message.type !== "HELLO") {
        send(socket, {
          type: "ERROR",
          code: "FORBIDDEN",
          message: "Send HELLO before using the session.",
        });
        socket.close(1008, "HELLO required");
        return;
      }
      try {
        const joined = manager.join(message);
        participant = joined.participant;
        manager.attach(participant, socket);
        clearTimeout(helloTimeout);
        send(socket, {
          type: "WELCOME",
          clientId: participant.clientId,
          token: participant.token,
          role: participant.role,
          view: manager.view(joined.session, participant),
        });
        broadcast(joined.session);
      } catch (error) {
        if (error instanceof SessionFault) {
          send(socket, {
            type: "ERROR",
            code: error.code,
            message: error.message,
          });
          socket.close(1008, error.code);
          return;
        }
        console.error("WEBSOCKET_JOIN_ERROR", {
          name: error instanceof Error ? error.name : "UNKNOWN",
        });
        socket.close(1011, "Unable to join session");
      }
      return;
    }
    if (message.type === "HELLO") {
      send(socket, {
        type: "ERROR",
        code: "BAD_MESSAGE",
        message: "This connection is already bound to a role.",
      });
      return;
    }
    if (message.type === "PING") {
      participant.lastSeenMs = Date.now();
      send(socket, { type: "PONG", ts: message.ts });
      return;
    }
    if (message.type === "INTENT") {
      try {
        const { session } = manager.dispatch(
          participant.clientId,
          message.intent,
        );
        broadcast(session);
      } catch (error) {
        if (error instanceof SessionFault) {
          send(socket, {
            type: "ERROR",
            code: error.code,
            message: error.message,
          });
          return;
        }
        console.error("WEBSOCKET_INTENT_ERROR", {
          name: error instanceof Error ? error.name : "UNKNOWN",
        });
        send(socket, {
          type: "ERROR",
          code: "INVALID_INTENT",
          message: "The action could not be processed.",
        });
      }
    }
  });

  socket.on("close", () => {
    clearTimeout(helloTimeout);
    if (participant) manager.disconnect(participant.clientId, socket);
  });
});

sockets.on("error", (error: NodeJS.ErrnoException) => {
  console.error("WEBSOCKET_SERVER_ERROR", { code: error.code ?? "UNKNOWN" });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error("SERVER_ERROR", { code: error.code ?? "UNKNOWN" });
  process.exitCode = 1;
});

const clock = setInterval(() => {
  for (const session of manager.advanceClocks()) broadcast(session);
  const now = Date.now();
  for (const participant of manager.connectedParticipants()) {
    if (participant.socket && now - participant.lastSeenMs > 60_000) {
      participant.socket.terminate();
    }
  }
}, 500);

server.listen(config.port, "0.0.0.0", () => {
  console.info(
    `DHUNDH ${config.version} listening on 0.0.0.0:${config.port}; health: /health; WebSocket: /ws`,
  );
});

function shutdown(): void {
  clearInterval(clock);
  for (const socket of sockets.clients) socket.terminate();
  sockets.close();
  manager.removeAll();
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
