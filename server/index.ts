import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { config } from "./config.ts";

const app = express();
app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    version: config.version,
    uptimeSec: Math.floor(process.uptime()),
    sessions: 0,
  });
});

app.use(["/api", "/ws", "/health"], (_request, response) => {
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

sockets.on("connection", (socket) => {
  socket.on("error", (error: NodeJS.ErrnoException) => {
    console.error("WEBSOCKET_ERROR", { code: error.code ?? "UNKNOWN" });
  });
  socket.on("message", () => {
    socket.close(1008, "Session messaging is not available at Gate 0.");
  });
});

sockets.on("error", (error: NodeJS.ErrnoException) => {
  console.error("WEBSOCKET_SERVER_ERROR", { code: error.code ?? "UNKNOWN" });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error("SERVER_ERROR", { code: error.code ?? "UNKNOWN" });
  process.exitCode = 1;
});

server.listen(config.port, "0.0.0.0", () => {
  console.info(
    `DHUNDH ${config.version} listening on 0.0.0.0:${config.port}; health: /health; WebSocket: /ws`,
  );
});

function shutdown() {
  for (const socket of sockets.clients) {
    socket.terminate();
  }
  sockets.close();
  server.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
