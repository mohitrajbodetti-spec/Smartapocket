package com.campusledger.app

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class MyNotificationListenerService : NotificationListenerService() {

    private var lastSignature: String = ""
    private var lastTimestamp: Long = 0L

    override fun onListenerConnected() {
        super.onListenerConnected()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                requestRebind(ComponentName(this, MyNotificationListenerService::class.java))
            } catch (_: Exception) {
            }
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val packageName = sbn.packageName ?: return

        // Ignore system UI & our own app's notifications
        if (packageName == applicationContext.packageName || packageName == "com.android.systemui") {
            return
        }

        val notification = sbn.notification ?: return
        // Skip ongoing notifications (like music players, timers, foreground service banners)
        if ((notification.flags and Notification.FLAG_ONGOING_EVENT) != 0) {
            return
        }

        val extras = notification.extras
        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()
            ?: extras?.getString("android.title")
            ?: ""
        val bigText = extras?.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val normalText = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()
            ?: extras?.getCharSequence("android.text")?.toString()
            ?: ""
        val subText = extras?.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val ticker = notification.tickerText?.toString() ?: ""

        val text = when {
            bigText.isNotBlank() -> bigText
            normalText.isNotBlank() -> normalText
            else -> ticker
        }.trim()

        if (title.isBlank() && text.isBlank()) return

        // Check if this notification is from an allowed payment app or a bank/UPI SMS
        val defaultSmsPkg = try {
            Telephony.Sms.getDefaultSmsPackage(applicationContext) ?: ""
        } catch (_: Exception) {
            ""
        }

        if (!isAllowedFinancialNotification(packageName, title, text, subText, defaultSmsPkg)) {
            return
        }

        // Deduplicate rapid identical updates from the same notification within 3 seconds
        val now = System.currentTimeMillis()
        val sig = "$packageName|$title|$text"
        if (sig == lastSignature && (now - lastTimestamp) < 3000L) {
            return
        }
        lastSignature = sig
        lastTimestamp = now

        val id = "${sbn.postTime}_${sig.hashCode()}"

        // 1. Persist in SharedPreferences so notifications received while the app is closed are never lost
        enqueueNotification(applicationContext, id, packageName, title, text, sbn.postTime)

        // 2. Broadcast this data locally inside the Android environment for real-time WebView updates
        val intent = Intent("INTERCEPTED_NOTIFICATION").apply {
            putExtra("id", id)
            putExtra("package", packageName)
            putExtra("title", title)
            putExtra("text", text)
            putExtra("postTime", sbn.postTime)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    companion object {
        const val PREFS_NAME = "campus_ledger_notif_store"
        const val KEY_QUEUE = "pending_notifications"

        // Explicitly blocked social / chat / entertainment / shopping promo apps
        private val BLOCKED_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "com.instagram.android",
            "com.facebook.orca",
            "com.facebook.katana",
            "com.snapchat.android",
            "com.discord",
            "com.twitter.android",
            "com.google.android.youtube",
            "com.google.android.gm",
            "com.spotify.music"
        )

        // Allowed UPI / Payment app packages (PhonePe, Google Pay, Paytm, RuPay, FamPay/FanPay, BHIM UPI)
        private val ALLOWED_PAYMENT_PACKAGES = setOf(
            "com.phonepe.app",
            "com.phonepe.app.business",
            "com.google.android.apps.nbu.paisa.user",
            "net.one97.paytm",
            "com.paytm.business",
            "com.fampay.in",
            "in.fampay.app",
            "in.org.npci.upiapp"
        )

        // Known Android SMS packages (reads all SMS notifications, then filters for bank/UPI content)
        private val KNOWN_SMS_PACKAGES = setOf(
            "com.google.android.apps.messaging",
            "com.samsung.android.messaging",
            "com.android.mms",
            "com.android.messaging",
            "com.miui.mms",
            "com.oneplus.mms",
            "com.coloros.mcs",
            "com.vivo.message",
            "com.oppo.mms",
            "com.asus.message",
            "com.motorola.messaging",
            "com.sonyericsson.conversations"
        )

        private val PAYMENT_BRAND_REGEX = Regex(
            "\\b(phonepe|phonepay|google\\s*pay|googlepay|gpay|paytm|rupay|fampay|fanpay|bhim|upi|vpa)\\b",
            RegexOption.IGNORE_CASE
        )

        private val BANK_NAME_REGEX = Regex(
            "\\b(sbi|state\\s+bank|hdfc|icici|axis|kotak|boi|bank\\s+of\\s+india|bob|bank\\s+of\\s+baroda|" +
                "pnb|punjab\\s+national|canara|union\\s+bank|ubi|idfc|indusind|yes\\s+bank|federal\\s+bank|" +
                "indian\\s+bank|central\\s+bank|uco\\s+bank|bank\\s+of\\s+maharashtra|bom|iob|indian\\s+overseas|" +
                "punjab\\s*&\\s*sind|south\\s+indian\\s+bank|sib|karur\\s+vysya|kvb|city\\s+union|cub|rbl|" +
                "bandhan|idbi|au\\s+bank|au\\s+small\\s+finance|equitas|ujjivan|jana\\s+bank|saraswat|cosmos|" +
                "dbs|standard\\s+chartered|citi|citibank|hsbc|deutsche|karnataka\\s+bank|tamilnad\\s+mercantile|" +
                "tmb|nainital\\s+bank|dhanlaxmi|csb\\s+bank|j&k\\s+bank|jammu\\s*&\\s*kashmir\\s+bank|" +
                "paytm\\s+payments\\s+bank|airtel\\s+payments\\s+bank|india\\s+post\\s+payments\\s+bank|ippb|" +
                "fino|fi\\s+money|jupiter|bank|a/c|acct)\\b",
            RegexOption.IGNORE_CASE
        )

        fun isAllowedFinancialNotification(
            pkg: String,
            title: String,
            text: String,
            subText: String,
            defaultSmsPkg: String
        ): Boolean {
            val lowerPkg = pkg.lowercase(Locale.ROOT)
            if (BLOCKED_PACKAGES.contains(lowerPkg)) return false

            val combined = "$title $text $subText"

            // 1. Direct allowed payment app (PhonePe, Google Pay, Paytm, FamPay/FanPay, BHIM UPI)
            if (ALLOWED_PAYMENT_PACKAGES.contains(lowerPkg)) {
                return true
            }
            if (lowerPkg.contains("phonepe") || lowerPkg.contains("paisa") ||
                lowerPkg.contains("paytm") || lowerPkg.contains("fampay") ||
                lowerPkg.contains("fanpay") || lowerPkg.contains("rupay") ||
                lowerPkg.contains("npci") || lowerPkg.contains("upi")
            ) {
                return true
            }

            // 2. Check if it is an SMS notification
            val isSmsApp = KNOWN_SMS_PACKAGES.contains(lowerPkg) ||
                (defaultSmsPkg.isNotEmpty() && lowerPkg == defaultSmsPkg.lowercase(Locale.ROOT)) ||
                lowerPkg.contains(".mms") ||
                lowerPkg.contains(".messaging") ||
                lowerPkg.contains("sms")

            if (isSmsApp) {
                // Read all SMS, but only capture if it has a Bank name or PhonePe/GPay/Paytm/RuPay/FamPay/UPI
                return BANK_NAME_REGEX.containsMatchIn(combined) || PAYMENT_BRAND_REGEX.containsMatchIn(combined)
            }

            // 3. Official Bank / UPI app notification that explicitly references PhonePe/GPay/Paytm/RuPay/FamPay/UPI
            if (PAYMENT_BRAND_REGEX.containsMatchIn(combined) && BANK_NAME_REGEX.containsMatchIn(combined)) {
                return true
            }

            return false
        }

        @Synchronized
        fun enqueueNotification(
            context: Context,
            id: String,
            pkg: String,
            title: String,
            text: String,
            postTime: Long
        ) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
                val arr = JSONArray(raw)
                val item = JSONObject().apply {
                    put("id", id)
                    put("package", pkg)
                    put("title", title)
                    put("text", text)
                    put("postTime", postTime)
                }
                val next = JSONArray()
                next.put(item)
                val limit = minOf(arr.length(), 39)
                for (i in 0 until limit) {
                    val existing = arr.optJSONObject(i)
                    if (existing != null && existing.optString("id") != id) {
                        next.put(existing)
                    }
                }
                prefs.edit().putString(KEY_QUEUE, next.toString()).apply()
            } catch (_: Exception) {
            }
        }

        @Synchronized
        fun removeNotificationById(context: Context, id: String) {
            try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
                val arr = JSONArray(raw)
                val next = JSONArray()
                for (i in 0 until arr.length()) {
                    val obj = arr.optJSONObject(i)
                    if (obj != null && obj.optString("id") != id) {
                        next.put(obj)
                    }
                }
                prefs.edit().putString(KEY_QUEUE, next.toString()).apply()
            } catch (_: Exception) {
            }
        }

        @Synchronized
        fun drainNotifications(context: Context): JSONArray {
            return try {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
                prefs.edit().putString(KEY_QUEUE, "[]").apply()
                JSONArray(raw)
            } catch (_: Exception) {
                JSONArray()
            }
        }
    }
}
