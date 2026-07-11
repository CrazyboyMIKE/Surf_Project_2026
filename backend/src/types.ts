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
};

export type Participant = {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
};

export type RoomState = {
  roomName: string;
  robotId?: string;
  robotOnline: boolean;
  participants: Map<string, Participant>;
  currentControllerId?: string;
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
  }>;
};

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "ROOM_NOT_FOUND"
  | "PARTICIPANT_NOT_FOUND"
  | "NOT_CONTROLLER"
  | "COMMAND_NOT_ALLOWED"
  | "INVALID_PARAMETERS"
  | "ROBOT_OFFLINE"
  | "CONTROLLER_BUSY";
