package com.surf.robot

class MockRobotControlAdapter : RobotControlAdapter {
    override fun moveDistance(distanceCm: Int): String {
        return "Mock control: 1002 move ${distanceCm}cm. Hardware movement is disabled."
    }

    override fun rotateAngle(angleDeg: Int): String {
        return "Mock control: 1003 rotate ${angleDeg}deg. Hardware movement is disabled."
    }

    override fun stop(): String {
        return "Mock control: 1000 stop. Hardware movement is disabled."
    }
}
