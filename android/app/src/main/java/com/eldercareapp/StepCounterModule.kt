package com.eldercareapp

import android.content.Context
import android.content.SharedPreferences
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class StepCounterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), SensorEventListener {

    private val sensorManager: SensorManager =
        reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val stepSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    private val prefs: SharedPreferences =
        reactContext.getSharedPreferences("step_prefs", Context.MODE_PRIVATE)

    override fun getName(): String = "StepCounterModule"

    init {
        StepCounterModule.onDayChanged = {
            val today = todayString()
            prefs.edit()
                .putString("last_date", today)
                .putLong("base_steps", -1L)
                .apply()
            sendStepEvent(0)
        }
    }

    @ReactMethod
    fun startListening() {
        android.util.Log.d("StepCounter", "startListening called, sensor=$stepSensor")
        if (stepSensor == null) {
            sendStepEvent(0)
            return
        }
        val lastKnownSteps = prefs.getLong("base_steps", -1L)
        if (lastKnownSteps != -1L) {
            val today = todayString()
            val lastDate = prefs.getString("last_date", "")
            if (lastDate != today) {
                prefs.edit()
                    .putString("last_date", today)
                    .putLong("base_steps", -1L)
                    .apply()
                sendStepEvent(0)
            }
        }
        sensorManager.registerListener(this, stepSensor, SensorManager.SENSOR_DELAY_NORMAL)
    }

    @ReactMethod
    fun stopListening() {
        sensorManager.unregisterListener(this)
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    private fun todayString(): String =
        SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun calculateTodaySteps(totalSteps: Long): Int {
        val today = todayString()
        val lastDate = prefs.getString("last_date", "")
        val baseSteps = prefs.getLong("base_steps", -1L)

        return if (lastDate != today || baseSteps == -1L) {
            prefs.edit()
                .putString("last_date", today)
                .putLong("base_steps", totalSteps)
                .apply()
            0
        } else {
            if (totalSteps < baseSteps) {
                prefs.edit().putLong("base_steps", totalSteps).apply()
                return 0
            }
            (totalSteps - baseSteps).toInt()
        }
    }

    private fun sendStepEvent(steps: Int) {
        android.util.Log.d("StepCounter", "sendStepEvent: $steps")
        try {
            val params = Arguments.createMap().apply { putInt("steps", steps) }
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("StepCounterUpdate", params)
        } catch (e: Exception) {
            android.util.Log.e("StepCounter", "sendStepEvent error: $e")
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null || event.sensor.type != Sensor.TYPE_STEP_COUNTER) return
        val totalSteps = event.values[0].toLong()
        android.util.Log.d("StepCounter", "onSensorChanged totalSteps=$totalSteps")
        val todaySteps = calculateTodaySteps(totalSteps)
        sendStepEvent(todaySteps)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        var onDayChanged: (() -> Unit)? = null
    }
}
