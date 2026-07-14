package com.surf.robot

interface RobotControlAdapter {
    fun moveDistance(distanceCm: Int): String
    fun rotateAngle(angleDeg: Int): String
    fun stop(): String
}
