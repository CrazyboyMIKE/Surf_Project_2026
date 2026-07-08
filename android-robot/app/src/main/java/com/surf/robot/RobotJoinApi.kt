package com.surf.robot

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException

class RobotJoinApi(
    private val httpClient: OkHttpClient = OkHttpClient(),
) {
    suspend fun joinRobot(backendUrl: String, roomName: String, robotId: String): RobotJoinResponse =
        withContext(Dispatchers.IO) {
            val normalizedBackendUrl = normalizeBackendUrl(backendUrl)
            val payload = JSONObject()
                .put("roomName", roomName)
                .put("robotId", robotId)
                .toString()
                .toRequestBody(JSON.toMediaType())

            val request = Request.Builder()
                .url("$normalizedBackendUrl/api/robots/join")
                .post(payload)
                .build()

            httpClient.newCall(request).execute().use { response ->
                val responseText = response.body?.string().orEmpty()
                val json = if (responseText.isNotBlank()) JSONObject(responseText) else JSONObject()

                if (!response.isSuccessful) {
                    val message = json.optString("message", "Robot join failed: HTTP ${response.code}")
                    throw IOException(message)
                }

                RobotJoinResponse(
                    robotId = json.getString("robotId"),
                    roomName = json.getString("roomName"),
                    participantId = json.getString("participantId"),
                    role = json.getString("role"),
                    online = json.optBoolean("online", false),
                    liveKitUrl = json.getString("liveKitUrl"),
                    token = json.getString("token"),
                    tokenMode = json.optString("tokenMode", "mock"),
                )
            }
        }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        fun normalizeBackendUrl(rawUrl: String): String {
            val trimmed = rawUrl.trim().trimEnd('/')
            require(trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                "backendUrl must start with http:// or https://"
            }
            return trimmed
        }
    }
}
