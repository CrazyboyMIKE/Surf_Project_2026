package com.surf.robot

data class RobotJoinResponse(
    val robotId: String,
    val roomName: String,
    val participantId: String,
    val role: String,
    val online: Boolean,
    val liveKitUrl: String,
    val token: String,
    val tokenMode: String,
)
