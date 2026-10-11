package com.campusledger.app

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.text.TextUtils
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NotificationInterceptor")
class NotificationInterceptorPlugin : Plugin() {

    private var receiver: BroadcastReceiver? = null

    override fun load() {
        val filter = IntentFilter("INTERCEPTED_NOTIFICATION")

        receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent != null) {
                    val id = intent.getStringExtra("id") ?: ""
                    if (id.isNotEmpty()) {
                        MyNotificationListenerService.removeNotificationById(context, id)
                    }
                    val data = JSObject().apply {
                        put("id", id)
                        put("package", intent.getStringExtra("package") ?: "")
                        put("title", intent.getStringExtra("title") ?: "")
                        put("text", intent.getStringExtra("text") ?: "")
                        put("postTime", intent.getLongExtra("postTime", System.currentTimeMillis()))
                    }

                    // Push the notification object straight to your JavaScript web app code
                    notifyListeners("onNotificationReceived", data, true)
                }
            }
        }
        LocalBroadcastManager.getInstance(context).registerReceiver(receiver!!, filter)
        ensureServiceRebound()
    }

    override fun handleOnResume() {
        super.handleOnResume()
        ensureServiceRebound()
        flushPendingToListeners()
    }

    override fun handleOnDestroy() {
        receiver?.let {
            LocalBroadcastManager.getInstance(context).unregisterReceiver(it)
            receiver = null
        }
        super.handleOnDestroy()
    }

    // Native check to see if the user granted OS permission yet
    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val enabled = isNotificationListenerEnabled()
        if (enabled) {
            ensureServiceRebound()
            flushPendingToListeners()
        }
        val ret = JSObject()
        ret.put("granted", enabled)
        call.resolve(ret)
    }

    // Open Android OS "Notification access" settings screen
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            val ret = JSObject()
            ret.put("opened", true)
            ret.put("granted", isNotificationListenerEnabled())
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Could not open Notification Listener settings", e)
        }
    }

    // Drain any notifications captured while the app was closed/backgrounded
    @PluginMethod
    fun drainPending(call: PluginCall) {
        val arr = MyNotificationListenerService.drainNotifications(context)
        val jsArr = JSArray()
        for (i in (arr.length() - 1) downTo 0) {
            val obj = arr.optJSONObject(i) ?: continue
            val item = JSObject().apply {
                put("id", obj.optString("id"))
                put("package", obj.optString("package"))
                put("title", obj.optString("title"))
                put("text", obj.optString("text"))
                put("postTime", obj.optLong("postTime"))
            }
            jsArr.put(item)
        }
        val ret = JSObject()
        ret.put("items", jsArr)
        call.resolve(ret)
    }

    private fun flushPendingToListeners() {
        if (!hasListeners("onNotificationReceived")) return
        val arr = MyNotificationListenerService.drainNotifications(context)
        for (i in (arr.length() - 1) downTo 0) {
            val obj = arr.optJSONObject(i) ?: continue
            val data = JSObject().apply {
                put("id", obj.optString("id"))
                put("package", obj.optString("package"))
                put("title", obj.optString("title"))
                put("text", obj.optString("text"))
                put("postTime", obj.optLong("postTime"))
            }
            notifyListeners("onNotificationReceived", data, true)
        }
    }

    private fun ensureServiceRebound() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isNotificationListenerEnabled()) {
            try {
                NotificationListenerService.requestRebind(
                    ComponentName(context, MyNotificationListenerService::class.java)
                )
            } catch (_: Exception) {
            }
        }
    }

    private fun isNotificationListenerEnabled(): Boolean {
        val pkgName = context.packageName
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        )
        if (!flat.isNullOrEmpty()) {
            val names = flat.split(":")
            for (name in names) {
                val cn = ComponentName.unflattenFromString(name)
                if (cn != null && TextUtils.equals(pkgName, cn.packageName)) {
                    return true
                }
            }
        }
        return false
    }
}
