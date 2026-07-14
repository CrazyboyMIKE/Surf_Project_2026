package com.surf.robot

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

class RobotControlMessageHandler(
    private val httpClient: OkHttpClient = OkHttpClient(),
    private val controlAdapter: RobotControlAdapter = MockRobotControlAdapter(),
    private val onStatus: (String) -> Unit,
    private val onControlMessage: (String) -> Unit,
) {
    private var webSocket: WebSocket? = null

    fun connect(backendUrl: String, roomName: String, participantId: String) {
        disconnect()

        val wsUrl = toWebSocketUrl(RobotJoinApi.normalizeBackendUrl(backendUrl))
        val request = Request.Builder().url(wsUrl).build()
        onStatus("WebSocket connecting")

        webSocket = httpClient.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    onStatus("WebSocket connected")
                    val hello = JSONObject()
                        .put("type", "hello")
                        .put("roomName", roomName)
                        .put("participantId", participantId)
                    webSocket.send(hello.toString())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(text)
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    onStatus("WebSocket error: ${t.message ?: "unknown"}")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    onStatus("WebSocket closed")
                }
            },
        )
    }

    fun disconnect() {
        webSocket?.close(1000, "Robot app disconnect")
        webSocket = null
    }

    private fun handleMessage(text: String) {
        val json = runCatching { JSONObject(text) }.getOrNull() ?: return
        if (json.optString("type") != "robot_control") {
            return
        }

        val command = json.optString("command")
        val parameters = json.optJSONObject("parameters") ?: JSONObject()
        val result = when (command) {
            "1002" -> controlAdapter.moveDistance(parameters.optInt("distanceCm", 20))
            "1003" -> controlAdapter.rotateAngle(parameters.optInt("angleDeg", 15))
            "1000" -> controlAdapter.stop()
            else -> "Ignored disallowed command: $command"
        }
        onControlMessage(result)
    }

    private fun toWebSocketUrl(backendUrl: String): String {
        val wsBase = when {
            backendUrl.startsWith("https://") -> "wss://" + backendUrl.removePrefix("https://")
            backendUrl.startsWith("http://") -> "ws://" + backendUrl.removePrefix("http://")
            else -> error("backendUrl must start with http:// or https://")
        }
        return "$wsBase/ws"
    }
}
