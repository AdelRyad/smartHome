package com.Avante

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        if (intent?.action == Intent.ACTION_BOOT_COMPLETED) {
            val launchIntent = context?.packageManager?.getLaunchIntentForPackage("com.Avante")
            context?.startActivity(launchIntent?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) })
        }
    }
}
