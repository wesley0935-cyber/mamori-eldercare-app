package com.eldercareapp

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScreenUnlockModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "ScreenUnlockModule"

    init {
        // Wire receiver events → JS EventEmitter
        ScreenUnlockReceiver.onEvent = { type, ts ->
            emitToJS(type, ts)
        }
    }

    private fun emitToJS(type: String, timestamp: Long) {
        if (!ctx.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putString("type", type)
            putDouble("timestamp", timestamp.toDouble())
        }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("ScreenUnlockEvent", params)
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(ctx, ScreenUnlockForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        ctx.stopService(Intent(ctx, ScreenUnlockForegroundService::class.java))
    }

    /**
     * Returns today's unlock/screen-off log as an array of {type, timestamp}.
     * Reads from SharedPreferences written by ScreenUnlockReceiver.
     */
    @ReactMethod
    fun getUnlockHistory(promise: Promise) {
        try {
            val prefs = ctx.getSharedPreferences(ScreenUnlockReceiver.PREFS_NAME, Context.MODE_PRIVATE)
            val dayKey = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            val raw = prefs.getString(dayKey, "") ?: ""
            val result = Arguments.createArray()

            if (raw.isNotEmpty()) {
                raw.split(",").forEach { entry ->
                    val colon = entry.lastIndexOf(':')
                    if (colon > 0) {
                        val map = Arguments.createMap().apply {
                            putString("type", entry.substring(0, colon))
                            putDouble("timestamp", entry.substring(colon + 1).toDouble())
                        }
                        result.pushMap(map)
                    }
                }
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("HISTORY_ERROR", e.message, e)
        }
    }

    // Required stubs for RN NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
