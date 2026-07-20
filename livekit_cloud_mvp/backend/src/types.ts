export type Role = "robot" | "controller" | "viewer";
export type WebRole = "controller" | "viewer";
export type RobotCommand = "1002" | "1003" | "1000";

export type MediaPermissions = {
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishAudio: boolean;
  canPublishVideo: boolean;
};

export type ControlParameters = {
  distanceCm?: number;
  angleDeg?: number;
  speed?: number;
};

export type Participant = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt?: number;
};

export type RoomState = {
  roomName: string;
  robotId?: string;
  robotOnline: boolean;
  participants: Map<string, Participant>;
  currentControllerId?: string;
  updatedAt: number;
  lastRobotControl?: {
    command: RobotCommand;
    parameters: ControlParameters;
    from: string;
    timestamp: number;
  };
};

export type RoomSnapshot = {
  roomName: string;
  robotId?: string;
  robotOnline: boolean;
  currentControllerId?: string;
  currentControllerName?: string;
  participants: Array<{
    id: string;
    name: string;
    role: Role;
    connected: boolean;
    joinedAt: number;
    lastSeenAt: number;
    disconnectedAt?: number;
  }>;
};

export type AdminParticipantSnapshot = {
  participantId: string;
  identity: string;
  displayName: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt?: number;
};

export type AdminRoomSummary = {
  roomName: string;
  liveKitRoomName: string;
  robotId?: string;
  robotOnline: boolean;
  currentControllerId?: string;
  currentControllerName?: string;
  viewerCount: number;
  participantCount: number;
  connectedParticipantCount: number;
  updatedAt: number;
  canClose: boolean;
  closeDisabledReason?: string;
};

export type AdminRoomDetail = AdminRoomSummary & {
  participants: AdminParticipantSnapshot[];
};

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "NOT_CONTROLLER"
  | "COMMAND_NOT_ALLOWED"
  | "INVALID_PARAMETERS"
  | "ROBOT_OFFLINE"
  | "ROBOT_CONTROL_DISABLED"
  | "ROBOT_CONTROL_CONFIG_INCOMPLETE"
  | "ROBOT_CONTROL_FAILED"
  | "CONTROLLER_BUSY"
  | "TARGET_NOT_VIEWER"
  | "TARGET_OFFLINE"
  | "ADMIN_DISABLED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ROOM_NOT_EMPTY";
