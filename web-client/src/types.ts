export type Role = "robot" | "controller" | "viewer";
export type WebRole = "controller" | "viewer";
export type RobotCommand = "1002" | "1003" | "1000";

export type ControlParameters = {
  distanceCm?: number;
  angleDeg?: number;
};

export type JoinRoomRequest = {
  roomName: string;
  participantName: string;
  requestedRole: WebRole;
};

export type JoinRoomResponse = {
  roomName: string;
  participantId: string;
  participantName: string;
  role: WebRole;
  requestedControllerGranted: boolean;
  liveKitUrl: string;
  token: string;
  tokenMode: "mock" | "livekit";
  robotOnline: boolean;
  currentControllerId?: string;
  currentControllerName?: string;
};

export type ControlResponse = {
  ok: boolean;
  role?: WebRole;
  message: string;
  code?: string;
};

export type ParticipantSummary = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
};

export type ChatMessage = {
  type: "chat";
  roomName: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
};

export type RobotControlEvent = {
  type: "robot_control";
  roomName: string;
  command: RobotCommand;
  parameters: ControlParameters;
  from: string;
  timestamp: number;
};

export type RoleUpdateMessage = {
  type: "role_update";
  roomName: string;
  currentControllerId?: string;
  currentControllerName?: string;
  participants: ParticipantSummary[];
  timestamp: number;
};

export type RobotStatusMessage = {
  type: "robot_status";
  roomName: string;
  robotId?: string;
  online: boolean;
  timestamp: number;
};

export type ServerErrorMessage = {
  type: "error";
  code: string;
  message: string;
};

export type RoomSocketMessage =
  | ChatMessage
  | RobotControlEvent
  | RoleUpdateMessage
  | RobotStatusMessage
  | ServerErrorMessage
  | {
      type: "hello";
      roomName: string;
      participantId: string;
      role: Role;
      timestamp: number;
    };
