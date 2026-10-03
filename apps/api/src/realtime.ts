import type { WebSocket } from "ws";
import type { LiveDriver } from "./live.js";

type Client = {
  socket: WebSocket;
  vtcId?: number;
};

const clients = new Set<Client>();

export function addRealtimeClient(socket: WebSocket, vtcId?: number) {
  const client: Client = { socket, vtcId };
  clients.add(client);

  socket.on("close", () => clients.delete(client));
  socket.on("error", () => clients.delete(client));
}

export function broadcastDriver(driver: LiveDriver) {
  const payload = JSON.stringify({ type: "driver.position", driver });

  for (const client of clients) {
    if (client.vtcId && driver.vtcId !== client.vtcId) continue;
    if (client.socket.readyState !== 1) continue;
    client.socket.send(payload);
  }
}

export function broadcastOffline(driverId: string, vtcId?: number | null) {
  const payload = JSON.stringify({ type: "driver.offline", driverId });

  for (const client of clients) {
    if (client.vtcId && client.vtcId !== vtcId) continue;
    if (client.socket.readyState !== 1) continue;
    client.socket.send(payload);
  }
}
