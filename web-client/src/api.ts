import type { ControlResponse, JoinRoomRequest, JoinRoomResponse } from "./types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
export const WS_URL = import.meta.env.VITE_WS_URL ?? API_BASE_URL.replace(/^http/, "ws") + "/ws";

async function requestJson<TResponse>(path: string, options?: RequestInit): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const data = (await response.json()) as TResponse & { message?: string };
  if (!response.ok) {
    throw new Error(data.message ?? "Request failed");
  }

  return data;
}

export function joinRoom(payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  return requestJson<JoinRoomResponse>("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function requestControl(roomName: string, participantId: string): Promise<ControlResponse> {
  return requestJson<ControlResponse>("/api/rooms/control/request", {
    method: "POST",
    body: JSON.stringify({ roomName, participantId })
  });
}

export function releaseControl(roomName: string, participantId: string): Promise<ControlResponse> {
  return requestJson<ControlResponse>("/api/rooms/control/release", {
    method: "POST",
    body: JSON.stringify({ roomName, participantId })
  });
}
