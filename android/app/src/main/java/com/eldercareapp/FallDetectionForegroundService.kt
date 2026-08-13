package com.eldercareapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.content.SharedPreferences
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class FallDetectionForegroundService : Service(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var gyroscope: Sensor? = null
    private lateinit var prefs: SharedPreferences
    private var lastCheckedDate: String = ""
    private val handler = Handler(Looper.getMainLooper())
    private val inactivityRunnable = object : Runnable {
        override fun run() {
            val today = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
            if (lastCheckedDate.isNotEmpty() && lastCheckedDate != today) {
                onDayChanged?.invoke()
            }
            lastCheckedDate = today
            onInactivityCheck?.invoke()
            handler.postDelayed(this, 60_000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        prefs = getSharedPreferences("step_prefs", MODE_PRIVATE)
        handler.postDelayed(inactivityRunnable, 60_000L)

        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscope     = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        // SENSOR_DELAY_GAME ≈ 20 ms for responsive impact detection
        accelerometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gyroscope?.let     { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        super.onDestroy()
        sensorManager.unregisterListener(this)
        handler.removeCallbacks(inactivityRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onSensorChanged(event: SensorEvent) {
        val type = when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> "accelerometer"
            Sensor.TYPE_GYROSCOPE     -> "gyroscope"
            else -> return
        }
        onSensorData?.invoke(type, event.values[0], event.values[1], event.values[2])
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun ensureNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "跌倒偵測監控",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "持續監控感測器以偵測跌倒事件" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("ElderCare 跌倒偵測中")
            .setContentText("持續監控中，跌倒時自動通知家屬")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setOngoing(true)
            .build()

    companion object {
        private const val NOTIFICATION_ID = 1002
        const val CHANNEL_ID = "fall_detection_channel"

        // Callback set by FallDetectionModule to forward sensor data to JS
        var onSensorData: ((type: String, x: Float, y: Float, z: Float) -> Unit)? = null
        var onInactivityCheck: (() -> Unit)? = null
        var onDayChanged: (() -> Unit)? = null
    }
}
