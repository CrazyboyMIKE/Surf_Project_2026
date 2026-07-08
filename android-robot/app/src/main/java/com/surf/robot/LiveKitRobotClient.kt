package com.surf.robot

import android.content.Context
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class LiveKitRobotClient(
    context: Context,
    private val scope: CoroutineScope,
    private val onStatus: (String) -> Unit,
    private val onCameraStatus: (String) -> Unit,
) {
    private val room: Room = LiveKit.create(context.applicationContext)

    fun connectAndPublish(liveKitUrl: String, token: String, publishAudio: Boolean) {
        scope.launch {
            try {
                onStatus("LiveKit connecting")
                room.connect(liveKitUrl, token)
                onStatus("LiveKit connected")

                onCameraStatus("Opening camera")
                room.localParticipant.setCameraEnabled(true)
                onCameraStatus("Camera publishing")

                if (publishAudio) {
                    room.localParticipant.setMicrophoneEnabled(true)
                    onStatus("LiveKit connected, audio enabled")
                } else {
                    room.localParticipant.setMicrophoneEnabled(false)
                }
            } catch (error: Throwable) {
                onStatus("LiveKit error: ${error.message ?: "unknown"}")
                onCameraStatus("Camera failed. Check permission or camera occupancy.")
            }
        }
    }

    fun disconnect() {
        scope.launch {
            runCatching {
                room.localParticipant.setCameraEnabled(false)
                room.localParticipant.setMicrophoneEnabled(false)
                room.disconnect()
            }
            onStatus("LiveKit disconnected")
            onCameraStatus("Camera stopped")
        }
    }
}
