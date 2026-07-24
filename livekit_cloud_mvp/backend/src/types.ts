export type Role = "robot" | "controller" | "viewer";
export type WebRole = "controller" | "viewer";
export type RobotCommand = "1000" | "1002" | "1003" | "1004" | "1005" | "1006";
export type RobotContinuousCommand = "1001";
export type RobotControlEventCommand = RobotCommand | RobotContinuousCommand;
export type KeyboardDirection =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "forward_left"
  | "forward_right"
  | "backward_left"
  | "backward_right";

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
  d?: number;
  a?: number;
  av?: number;
};

export type ContinuousControlParameters = {
  lv: number;
  av: number;
  direction?: KeyboardDirection;
};

export type RobotControlLogParameters = ControlParameters & Partial<ContinuousControlParameters> & {
  stopReason?: string;
};

export type KeyboardControlPublicConfig = {
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

export type Participant = {
  id: string;
  name: string;
  role: Role;
  clientSessionId?: string;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt?: number;
};

export type RoomState = {
  roomName: string;
  historyRoomId?: number;
  robotId?: string;
  robotOnline: boolean;
  participants: Map<string, Participant>;
  currentControllerId?: string;
  updatedAt: number;
  lastRobotControl?: {
    command: RobotControlEventCommand;
    parameters: RobotControlLogParameters;
    from: string;
    timestamp: number;
  };
  keyboardControl?: KeyboardControlStatus;
};

export type RoomSnapshot = {
  roomName: string;
  robotId?: string;
  robotOnline: boolean;
  currentControllerId?: string;
  currentControllerName?: string;
  lastRobotControl?: {
    command: RobotControlEventCommand;
    parameters: RobotControlLogParameters;
    from: string;
    timestamp: number;
  };
  keyboardControl?: KeyboardControlStatus;
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

export type RoomRecordStatus = "open" | "closed";

export type RoomRecordSummary = {
  id: number;
  roomName: string;
  inviteCode?: string;
  status: RoomRecordStatus;
  currentControllerParticipantId?: string;
  robotId?: string;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  closeReason?: string;
  participantCount: number;
  viewerCount: number;
  controllerCount: number;
  latestControllerName?: string;
  robotParticipantName?: string;
};

export type RoomParticipantRecord = {
  id: number;
  roomId: number;
  participantId: string;
  clientSessionId?: string;
  participantName: string;
  role: Role;
  connected: boolean;
  joinedAt: number;
  lastSeenAt: number;
  leftAt?: number;
  kickedAt?: number;
  kickReason?: string;
};

export type RoomEventRecord = {
  id: number;
  roomId: number;
  type: string;
  actorParticipantId?: string;
  actorName?: string;
  payload?: Record<string, unknown>;
  createdAt: number;
};

export type RoomRecordDetail = RoomRecordSummary & {
  participants: RoomParticipantRecord[];
  events: RoomEventRecord[];
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
  | "KEYBOARD_CONTROL_DISABLED"
  | "KEYBOARD_CONTROL_INACTIVE"
  | "KEYBOARD_CONTROL_ACTIVE"
  | "CONTROLLER_BUSY"
  | "TARGET_NOT_VIEWER"
  | "TARGET_OFFLINE"
  | "ADMIN_DISABLED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ROOM_NOT_EMPTY"
  | "ROOM_CLOSED"
  | "PARTICIPANT_KICKED";
