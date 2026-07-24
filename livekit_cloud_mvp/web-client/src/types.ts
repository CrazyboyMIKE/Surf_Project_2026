export type Role = "robot" | "controller" | "viewer";
export type WebRole = "controller" | "viewer";
export type RobotCommand = "1000" | "1002" | "1003" | "1004" | "1005" | "1006";
export type RobotControlEventCommand = RobotCommand | "1001";
export type KeyboardDirection =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "forward_left"
  | "forward_right"
  | "backward_left"
  | "backward_right";

export type ControlParameters = {
  distanceCm?: number;
  angleDeg?: number;
  speed?: number;
  d?: number;
  a?: number;
  lv?: number;
  av?: number;
  direction?: KeyboardDirection;
  stopReason?: string;
};

export type KeyboardControlConfig = {
  enabled: boolean;
  continuous1001Enabled: boolean;
  mode: "1001";
  sendIntervalMs: number;
  deadmanTimeoutMs: number;
  maxSessionMs: number;
  maxLinearSpeed: number;
  maxAngularSpeed: number;
  defaultLinearSpeed: number;
  defaultAngularSpeed: number;
  requireFocus: boolean;
};

export type KeyboardControlStatus = {
  roomName: string;
  active: boolean;
  controllerId?: string;
  controllerName?: string;
  direction?: KeyboardDirection;
  linearSpeed?: number;
  angularSpeed?: number;
  stopReason?: string;
  updatedAt: number;
};

export type MediaPermissions = {
  canSubscribe: boolean;
  canPublish: boolean;
  canPublishAudio: boolean;
  canPublishVideo: boolean;
};

export type JoinRoomRequest = {
  roomName: string;
  participantName: string;
  requestedRole: WebRole;
  previousParticipantId?: string;
  clientSessionId?: string;
};

export type JoinRoomResponse = {
  roomName: string;
  participantId: string;
  participantName: string;
  clientSessionId?: string;
  role: WebRole;
  requestedControllerGranted: boolean;
  reusedParticipant?: boolean;
  liveKitUrl: string;
  token: string;
  tokenMode: "mock" | "livekit";
  mediaPermissions: MediaPermissions;
  keyboardControl: KeyboardControlConfig;
  robotOnline: boolean;
  currentControllerId?: string;
  currentControllerName?: string;
};

export type ControlResponse = {
  ok: boolean;
  role?: WebRole;
  message: string;
  code?: string;
  liveKitUrl?: string;
  token?: string;
  tokenMode?: "mock" | "livekit";
  mediaPermissions?: MediaPermissions;
};

export type ControlTransferResponse = {
  ok: boolean;
  message: string;
  roomName?: string;
  previousControllerId?: string;
  previousControllerName?: string;
  currentControllerId?: string;
  currentControllerName?: string;
  participants?: ParticipantSummary[];
  code?: string;
};

export type LeaveRoomResponse = {
  ok: boolean;
  roomDeleted: boolean;
  message: string;
};

export type ParticipantSummary = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  joinedAt?: number;
  lastSeenAt?: number;
  disconnectedAt?: number;
};

export type AdminParticipant = {
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
  participants: AdminParticipant[];
};

export type AdminRoomsResponse = {
  ok: true;
  rooms: AdminRoomSummary[];
};

export type AdminRoomResponse = {
  ok: true;
  room: AdminRoomDetail;
};

export type AdminActionResponse = {
  ok: true;
  message?: string;
  released?: boolean;
  removedCount?: number;
  room?: AdminRoomDetail;
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
  command: RobotControlEventCommand;
  parameters: ControlParameters;
  from: string;
  timestamp: number;
};

export type RobotControlResultEvent = {
  type: "robot_control_result";
  roomName: string;
  ok: boolean;
  command: RobotCommand;
  mode: "mock" | "real";
  message: string;
  code?: string;
  timestamp: number;
};

export type KeyboardControlResultEvent = {
  type: "keyboard_control_result";
  ok: boolean;
  message: string;
  code?: string;
  status?: KeyboardControlStatus;
  timestamp: number;
};

export type KeyboardControlStatusMessage = KeyboardControlStatus & {
  type: "keyboard_control_status";
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
  | RobotControlResultEvent
  | KeyboardControlResultEvent
  | KeyboardControlStatusMessage
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
