package com.eldercareapp

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class FallDetectionModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    override fun getName(): String = "FallDetectionModule"

    init {
        // Wire native sensor data → JS EventEmitter
        FallDetectionForegroundService.onSensorData = { type, x, y, z ->
            emitSensorEvent(type, x, y, z)
        }
    }

    private fun emitSensorEvent(type: String, x: Float, y: Float, z: Float) {
        if (!ctx.hasActiveReactInstance()) return
        val params = Arguments.createMap().apply {
            putString("type", type)
            putDouble("x", x.toDouble())
            putDouble("y", y.toDouble())
            putDouble("z", z.toDouble())
        }
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("FallDetectionSensorEvent", params)
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(ctx, FallDetectionForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent)
        } else {
            ctx.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        ctx.stopService(Intent(ctx, FallDetectionForegroundService::class.java))
    }

    // Required stubs for RN NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}
}
