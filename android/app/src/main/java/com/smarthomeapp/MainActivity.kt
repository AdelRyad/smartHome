package com.smarthomeapp

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.view.View
import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "SmartHomeApp"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enforceKioskMode()
        hideSystemUI()
    }

    private fun enforceKioskMode() {
        val devicePolicyManager = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager

        if (devicePolicyManager.isDeviceOwnerApp(packageName)) {
            val adminComponent = ComponentName(this, KioskDeviceAdminReceiver::class.java)
            devicePolicyManager.setLockTaskPackages(adminComponent, arrayOf(packageName))
        }

        if (activityManager.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            startLockTask()
        }
    }

    private fun hideSystemUI() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )
    }

    override fun onBackPressed() {
        // Prevent back button exit
    }
}