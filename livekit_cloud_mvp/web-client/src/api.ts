import type {
  AdminActionResponse,
  AdminRoomResponse,
  AdminRoomsResponse,
  ControlResponse,
  ControlTransferResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  LeaveRoomResponse
} from "./types";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveWebSocketUrl(apiBaseUrl: string): string {
  const configuredWsUrl = import.meta.env.VITE_WS_BASE_URL ?? import.meta.env.VITE_WS_URL;
  const baseUrl = stripTrailingSlash(configuredWsUrl ?? apiBaseUrl.replace(/^http/, "ws"));
  return baseUrl.endsWith("/ws") ? baseUrl : `${baseUrl}/ws`;
}

export const API_BASE_URL = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001");
export const WS_URL = resolveWebSocketUrl(API_BASE_URL);

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

function adminHeaders(adminToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${adminToken}`
  };
}

export function joinRoom(payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  return requestJson<JoinRoomResponse>("/api/rooms/join", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function leaveRoom(roomName: string, participantId: string, clientSessionId: string): Promise<LeaveRoomResponse> {
  return requestJson<LeaveRoomResponse>("/api/rooms/leave", {
    method: "POST",
    body: JSON.stringify({ roomName, participantId, clientSessionId })
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

export function transferControl(
  roomName: string,
  fromParticipantId: string,
  targetParticipantId: string
): Promise<ControlTransferResponse> {
  return requestJson<ControlTransferResponse>("/api/rooms/control/transfer", {
    method: "POST",
    body: JSON.stringify({ roomName, fromParticipantId, targetParticipantId })
  });
}

export function listAdminRooms(adminToken: string): Promise<AdminRoomsResponse> {
  return requestJson<AdminRoomsResponse>("/api/admin/rooms", {
    headers: adminHeaders(adminToken)
  });
}

export function getAdminRoom(adminToken: string, roomName: string): Promise<AdminRoomResponse> {
  return requestJson<AdminRoomResponse>(`/api/admin/rooms/${encodeURIComponent(roomName)}`, {
    headers: adminHeaders(adminToken)
  });
}

export function adminReleaseController(adminToken: string, roomName: string): Promise<AdminActionResponse> {
  return requestJson<AdminActionResponse>(`/api/admin/rooms/${encodeURIComponent(roomName)}/control/release`, {
    method: "POST",
    headers: adminHeaders(adminToken)
  });
}

export function adminCleanupParticipants(adminToken: string, roomName: string): Promise<AdminActionResponse> {
  return requestJson<AdminActionResponse>(`/api/admin/rooms/${encodeURIComponent(roomName)}/participants/cleanup`, {
    method: "POST",
    headers: adminHeaders(adminToken)
  });
}

export function adminCloseRoom(adminToken: string, roomName: string): Promise<AdminActionResponse> {
  return requestJson<AdminActionResponse>(`/api/admin/rooms/${encodeURIComponent(roomName)}`, {
    method: "DELETE",
    headers: adminHeaders(adminToken)
  });
}
