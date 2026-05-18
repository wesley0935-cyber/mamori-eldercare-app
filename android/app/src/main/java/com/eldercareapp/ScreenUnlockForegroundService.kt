package com.eldercareapp

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.IntentFilter
import android.os.IBinder

/**
 * Foreground service that dynamically registers ScreenUnlockReceiver.
 * ACTION_USER_PRESENT and ACTION_SCREEN_OFF cannot be declared statically
 * in AndroidManifest since API 26 — dynamic registration inside a running
 * process is required.
 */
class ScreenUnlockForegroundService : Service() {

    private val receiver = ScreenUnlockReceiver()

    override fun onCreate() {
        super.onCreate()
        ensureNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        registerReceiver(receiver, filter)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(receiver)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun ensureNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "螢幕使用監控",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "持續監控螢幕解鎖狀態以保護長輩安全" }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("ElderCare 守護中")
            .setContentText("正在記錄螢幕使用狀態")
            .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
            .setOngoing(true)
            .build()

    companion object {
        private const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "screen_unlock_channel"
    }
}
