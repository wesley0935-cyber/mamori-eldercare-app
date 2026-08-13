package com.eldercareapp

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

class FusedLocationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val fusedClient = LocationServices.getFusedLocationProviderClient(reactContext)

    override fun getName(): String = "FusedLocationModule"

    @ReactMethod
    fun getCurrentLocation(timeoutMs: Int, promise: Promise) {
        if (ContextCompat.checkSelfPermission(
                reactContext, Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.resolve(null)
            return
        }

        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setDurationMillis(timeoutMs.toLong())
            .setMaxUpdateAgeMillis(5_000)
            .build()

        fusedClient.getCurrentLocation(request, null)
            .addOnSuccessListener { location ->
                if (location != null) {
                    val map = WritableNativeMap().apply {
                        putDouble("latitude", location.latitude)
                        putDouble("longitude", location.longitude)
                        putDouble("accuracy", location.accuracy.toDouble())
                    }
                    promise.resolve(map)
                } else {
                    // fallback：最後已知位置
                    fusedClient.lastLocation
                        .addOnSuccessListener { last ->
                            if (last != null) {
                                val map = WritableNativeMap().apply {
                                    putDouble("latitude", last.latitude)
                                    putDouble("longitude", last.longitude)
                                    putDouble("accuracy", last.accuracy.toDouble())
                                }
                                promise.resolve(map)
                            } else {
                                promise.resolve(null)
                            }
                        }
                        .addOnFailureListener { promise.resolve(null) }
                }
            }
            .addOnFailureListener {
                // fallback：最後已知位置
                fusedClient.lastLocation
                    .addOnSuccessListener { last ->
                        if (last != null) {
                            val map = WritableNativeMap().apply {
                                putDouble("latitude", last.latitude)
                                putDouble("longitude", last.longitude)
                                putDouble("accuracy", last.accuracy.toDouble())
                            }
                            promise.resolve(map)
                        } else {
                            promise.resolve(null)
                        }
                    }
                    .addOnFailureListener { promise.resolve(null) }
            }
    }
}
