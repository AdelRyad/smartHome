package com.Avante

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class KioskModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "KioskModule"
    }

    @ReactMethod
    fun startKioskMode() {
        val activity = currentActivity ?: return
        val devicePolicyManager = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        if (devicePolicyManager.isDeviceOwnerApp(activity.packageName)) {
           val adminComponent = ComponentName(activity, KioskDeviceAdminReceiver::class.java)
devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(activity.packageName))

            activity.startLockTask()
            Log.d("KioskModule", "Kiosk Mode started")
        } else {
            Log.e("KioskModule", "App is NOT a Device Owner. Kiosk Mode cannot be started.")
        }
    }

    @ReactMethod
    fun stopKioskMode() {
        val activity = currentActivity ?: return
        activity.stopLockTask()
        Log.d("KioskModule", "Kiosk Mode stopped")
    }
}
