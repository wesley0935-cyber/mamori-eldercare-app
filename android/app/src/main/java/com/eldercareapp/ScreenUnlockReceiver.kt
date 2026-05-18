package com.eldercareapp

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class ScreenUnlockReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val type = when (intent.action) {
            Intent.ACTION_USER_PRESENT -> "unlock"
            Intent.ACTION_SCREEN_OFF   -> "screen_off"
            else -> return
        }
        val ts = System.currentTimeMillis()
        persist(context, type, ts)
        onEvent?.invoke(type, ts)
    }

    private fun persist(context: Context, type: String, ts: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val dayKey = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date(ts))
        val existing = prefs.getString(dayKey, "") ?: ""
        val updated = if (existing.isEmpty()) "$type:$ts" else "$existing,$type:$ts"
        prefs.edit().putString(dayKey, updated).apply()
    }

    companion object {
        const val PREFS_NAME = "unlock_history"
        // Callback set by ScreenUnlockModule; cleared when module is torn down.
        var onEvent: ((type: String, timestamp: Long) -> Unit)? = null
    }
}
