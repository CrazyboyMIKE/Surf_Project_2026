package com.surf.robot

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var backendUrlInput: EditText
    private lateinit var robotIdInput: EditText
    private lateinit var roomNameInput: EditText
    private lateinit var publishAudioInput: CheckBox
    private lateinit var backendStatusView: TextView
    private lateinit var webSocketStatusView: TextView
    private lateinit var liveKitStatusView: TextView
    private lateinit var cameraStatusView: TextView
    private lateinit var remoteAudioStatusView: TextView
    private lateinit var lastControlView: TextView
    private lateinit var errorView: TextView

    private val robotJoinApi = RobotJoinApi()
    private val controlMessageHandler by lazy {
        RobotControlMessageHandler(
            onStatus = { status -> runOnUiThread { webSocketStatusView.text = status } },
            onControlMessage = { message -> runOnUiThread { lastControlView.text = message } },
        )
    }
    private val liveKitRobotClient by lazy {
        LiveKitRobotClient(
            context = this,
            scope = lifecycleScope,
            onStatus = { status -> runOnUiThread { liveKitStatusView.text = status } },
            onCameraStatus = { status -> runOnUiThread { cameraStatusView.text = status } },
            onRemoteAudioStatus = { status -> runOnUiThread { remoteAudioStatusView.text = status } },
        )
    }

    private var pendingJoin: (() -> Unit)? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildContentView())
    }

    override fun onDestroy() {
        controlMessageHandler.disconnect()
        liveKitRobotClient.disconnect()
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQUEST_MEDIA_PERMISSIONS) {
            return
        }

        val deniedPermission = permissions.zip(grantResults.toTypedArray()).firstOrNull { (_, result) ->
            result != PackageManager.PERMISSION_GRANTED
        }?.first

        if (deniedPermission != null) {
            errorView.text = "Permission denied: $deniedPermission. Camera publishing cannot start."
            cameraStatusView.text = "Camera permission denied"
            pendingJoin = null
            return
        }

        pendingJoin?.invoke()
        pendingJoin = null
    }

    private fun handleJoinClick() {
        errorView.text = ""
        val backendUrl = backendUrlInput.text.toString().trim()
        val robotId = robotIdInput.text.toString().trim()
        val roomName = roomNameInput.text.toString().trim()

        if (backendUrl.isBlank() || robotId.isBlank() || roomName.isBlank()) {
            errorView.text = "backendUrl, robotId, and roomName are required."
            return
        }

        pendingJoin = { joinAndPublish(backendUrl, robotId, roomName, publishAudioInput.isChecked) }
        requestNeededPermissions(publishAudioInput.isChecked)
    }

    private fun joinAndPublish(backendUrl: String, robotId: String, roomName: String, publishAudio: Boolean) {
        lifecycleScope.launch {
            try {
                backendStatusView.text = "Joining backend"
                cameraStatusView.text = "Camera idle"
                remoteAudioStatusView.text = "Remote audio idle"
                lastControlView.text = "No control messages yet"

                val response = robotJoinApi.joinRobot(backendUrl, roomName, robotId)
                backendStatusView.text = "Backend joined as ${response.participantId}"

                controlMessageHandler.connect(backendUrl, response.roomName, response.participantId)

                if (response.tokenMode != "livekit" || response.liveKitUrl.startsWith("mock://")) {
                    liveKitStatusView.text = "LiveKit mock token"
                    cameraStatusView.text = "Configure LiveKit backend env to publish camera"
                    remoteAudioStatusView.text = "Configure LiveKit backend env to receive controller audio"
                    return@launch
                }

                liveKitRobotClient.connectAndPublish(response.liveKitUrl, response.token, publishAudio)
            } catch (error: Throwable) {
                backendStatusView.text = "Backend join failed"
                errorView.text = error.message ?: "Join failed"
            }
        }
    }

    private fun disconnect() {
        controlMessageHandler.disconnect()
        liveKitRobotClient.disconnect()
        webSocketStatusView.text = "WebSocket disconnected"
        liveKitStatusView.text = "LiveKit disconnected"
        cameraStatusView.text = "Camera stopped"
        remoteAudioStatusView.text = "Remote audio disconnected"
    }

    private fun requestNeededPermissions(publishAudio: Boolean) {
        val requiredPermissions = mutableListOf(Manifest.permission.CAMERA)
        if (publishAudio) {
            requiredPermissions += Manifest.permission.RECORD_AUDIO
        }

        val missingPermissions = requiredPermissions.filter { permission ->
            ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isEmpty()) {
            pendingJoin?.invoke()
            pendingJoin = null
            return
        }

        ActivityCompat.requestPermissions(this, missingPermissions.toTypedArray(), REQUEST_MEDIA_PERMISSIONS)
    }

    private fun buildContentView(): View {
        backendUrlInput = editText("Backend URL", "http://192.168.1.100:3001")
        robotIdInput = editText("Robot ID", "robot-001")
        roomNameInput = editText("Room name", "robot-room-001")
        publishAudioInput = CheckBox(this).apply {
            text = "Publish microphone audio"
            isChecked = false
        }

        backendStatusView = statusText("Backend: idle")
        webSocketStatusView = statusText("WebSocket: idle")
        liveKitStatusView = statusText("LiveKit: idle")
        cameraStatusView = statusText("Camera: idle")
        remoteAudioStatusView = statusText("Remote audio: idle")
        lastControlView = statusText("No control messages yet")
        errorView = statusText("")

        val joinButton = Button(this).apply {
            text = "Join and publish camera"
            setOnClickListener { handleJoinClick() }
        }
        val disconnectButton = Button(this).apply {
            text = "Disconnect"
            setOnClickListener { disconnect() }
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 28, 28, 28)
            addView(title("SURF Android Robot"))
            addView(label("backendUrl"))
            addView(backendUrlInput)
            addView(label("robotId"))
            addView(robotIdInput)
            addView(label("roomName"))
            addView(roomNameInput)
            addView(publishAudioInput)
            addView(joinButton)
            addView(disconnectButton)
            addView(section("Status"))
            addView(backendStatusView)
            addView(webSocketStatusView)
            addView(liveKitStatusView)
            addView(cameraStatusView)
            addView(remoteAudioStatusView)
            addView(section("Last control message"))
            addView(lastControlView)
            addView(section("Errors"))
            addView(errorView)
        }

        return ScrollView(this).apply {
            addView(container)
        }
    }

    private fun editText(label: String, value: String): EditText {
        return EditText(this).apply {
            hint = label
            setText(value)
            setSingleLine(true)
        }
    }

    private fun title(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 24f
            setPadding(0, 0, 0, 20)
        }
    }

    private fun section(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            textSize = 18f
            setPadding(0, 24, 0, 8)
        }
    }

    private fun label(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setPadding(0, 12, 0, 0)
        }
    }

    private fun statusText(text: String): TextView {
        return TextView(this).apply {
            this.text = text
            setPadding(0, 6, 0, 6)
        }
    }

    companion object {
        private const val REQUEST_MEDIA_PERMISSIONS = 2001
    }
}
