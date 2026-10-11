package com.campusledger.app

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.text.TextUtils
import android.view.View
import android.webkit.JavascriptInterface
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.BridgeActivity
import org.json.JSONObject
import java.util.Locale

class MainActivity : BridgeActivity(), TextToSpeech.OnInitListener {

    private var notifReceiver: BroadcastReceiver? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady: Boolean = false
    private var pendingVoiceLang: String = "en-IN"
    private lateinit var speechIntentLauncher: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NotificationInterceptorPlugin::class.java)
        super.onCreate(savedInstanceState)

        // Initialize fallback ActivityResultLauncher for voice recognition intent
        speechIntentLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == Activity.RESULT_OK && result.data != null) {
                val matches = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val spoken = matches?.firstOrNull()?.trim() ?: ""
                if (spoken.isNotEmpty()) {
                    emitVoiceEvent("result", spoken)
                } else {
                    emitVoiceEvent("end", "")
                }
            } else {
                emitVoiceEvent("end", "")
            }
        }

        // Initialize native Android TextToSpeech for EDITH voice replies
        try {
            tts = TextToSpeech(this, this)
        } catch (_: Exception) {
        }

        createNotificationChannel()

        // Fit system window insets cleanly on every device
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#070A12")
        window.navigationBarColor = Color.parseColor("#0D1322")

        // Normalize WebView viewport & font zoom so every phone display renders 1:1 with CSS responsive bounds
        bridge?.webView?.apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            settings.apply {
                useWideViewPort = true
                loadWithOverviewMode = true
                textZoom = 100
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
            }
            addJavascriptInterface(CampusAndroidBridge(this@MainActivity), "CampusAndroid")
        }

        val filter = IntentFilter("INTERCEPTED_NOTIFICATION")
        notifReceiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val id = intent.getStringExtra("id") ?: ""
                val pkg = intent.getStringExtra("package") ?: ""
                val title = intent.getStringExtra("title") ?: ""
                val text = intent.getStringExtra("text") ?: ""
                val postTime = intent.getLongExtra("postTime", System.currentTimeMillis())

                if (id.isNotEmpty()) {
                    MyNotificationListenerService.removeNotificationById(this@MainActivity, id)
                }

                val payload = JSONObject().apply {
                    put("id", id)
                    put("package", pkg)
                    put("title", title)
                    put("text", text)
                    put("postTime", postTime)
                }.toString()

                bridge?.webView?.post {
                    bridge?.webView?.evaluateJavascript(
                        "window.__onCampusNotification && window.__onCampusNotification($payload);",
                        null
                    )
                }
            }
        }
        LocalBroadcastManager.getInstance(this).registerReceiver(notifReceiver!!, filter)
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val res = tts?.setLanguage(Locale("en", "IN"))
            if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.setLanguage(Locale.US)
            }
            tts?.setSpeechRate(1.03f)
            ttsReady = true
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Campus Ledger Unclassified Transactions",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Prompts to choose category, merchant, and item purchased when unknown"
                enableVibration(true)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            nm?.createNotificationChannel(channel)
        }
    }

    fun emitVoiceEvent(state: String, text: String) {
        val payload = JSONObject().apply {
            put("state", state)
            put("text", text)
        }.toString()
        bridge?.webView?.post {
            bridge?.webView?.evaluateJavascript(
                "window.__onCampusVoiceEvent && window.__onCampusVoiceEvent($payload);",
                null
            )
        }
    }

    fun startNativeVoiceRecognitionInternal(lang: String) {
        pendingVoiceLang = lang.ifBlank { "en-IN" }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQ_RECORD_AUDIO
            )
            return
        }

        runOnUiThread {
            try {
                tts?.stop()
                if (SpeechRecognizer.isRecognitionAvailable(this)) {
                    if (speechRecognizer == null) {
                        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
                        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                            override fun onReadyForSpeech(params: Bundle?) {
                                emitVoiceEvent("listening", "")
                            }

                            override fun onBeginningOfSpeech() {
                                emitVoiceEvent("listening", "")
                            }

                            override fun onRmsChanged(rmsdB: Float) {}
                            override fun onBufferReceived(buffer: ByteArray?) {}

                            override fun onEndOfSpeech() {
                                emitVoiceEvent("processing", "")
                            }

                            override fun onError(error: Int) {
                                // Fallback to system voice recognizer activity if direct recognizer fails on OEM ROMs
                                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ||
                                    error == SpeechRecognizer.ERROR_CLIENT ||
                                    error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                                ) {
                                    launchVoiceIntentFallback(pendingVoiceLang)
                                } else {
                                    emitVoiceEvent("error", "Voice error ($error)")
                                }
                            }

                            override fun onResults(results: Bundle?) {
                                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                val best = matches?.firstOrNull()?.trim() ?: ""
                                if (best.isNotEmpty()) {
                                    emitVoiceEvent("result", best)
                                } else {
                                    emitVoiceEvent("end", "")
                                }
                            }

                            override fun onPartialResults(partialResults: Bundle?) {
                                val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                                val partial = matches?.firstOrNull()?.trim() ?: ""
                                if (partial.isNotEmpty()) {
                                    emitVoiceEvent("partial", partial)
                                }
                            }

                            override fun onEvent(eventType: Int, params: Bundle?) {}
                        })
                    }

                    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, pendingVoiceLang)
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    }
                    speechRecognizer?.startListening(intent)
                    emitVoiceEvent("listening", "")
                } else {
                    launchVoiceIntentFallback(pendingVoiceLang)
                }
            } catch (_: Exception) {
                launchVoiceIntentFallback(pendingVoiceLang)
            }
        }
    }

    private fun launchVoiceIntentFallback(lang: String) {
        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak with EDITH Financial Assistant...")
            }
            emitVoiceEvent("listening", "")
            speechIntentLauncher.launch(intent)
        } catch (_: Exception) {
            emitVoiceEvent("error", "Speech recognition unavailable on this device")
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_RECORD_AUDIO) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startNativeVoiceRecognitionInternal(pendingVoiceLang)
            } else {
                emitVoiceEvent("error", "Microphone permission denied")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isNotificationServiceEnabled(this)) {
            try {
                NotificationListenerService.requestRebind(
                    ComponentName(this, MyNotificationListenerService::class.java)
                )
            } catch (_: Exception) {
            }
        }
        bridge?.webView?.post {
            bridge?.webView?.evaluateJavascript(
                "window.__onCampusResume && window.__onCampusResume();",
                null
            )
        }
    }

    override fun onDestroy() {
        notifReceiver?.let {
            LocalBroadcastManager.getInstance(this).unregisterReceiver(it)
            notifReceiver = null
        }
        try {
            speechRecognizer?.destroy()
            speechRecognizer = null
        } catch (_: Exception) {
        }
        try {
            tts?.stop()
            tts?.shutdown()
            tts = null
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    class CampusAndroidBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun checkPermission(): Boolean {
            return isNotificationServiceEnabled(activity)
        }

        @JavascriptInterface
        fun requestPermission(): Boolean {
            return try {
                val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.startActivity(intent)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun drainPending(): String {
            return MyNotificationListenerService.drainNotifications(activity).toString()
        }

        @JavascriptInterface
        fun copyToClipboard(text: String): Boolean {
            return try {
                activity.runOnUiThread {
                    val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                    cm?.setPrimaryClip(ClipData.newPlainText("Campus Ledger Transaction", text))
                }
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun sendUserNotification(title: String, message: String): Boolean {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED
                    ) {
                        ActivityCompat.requestPermissions(
                            activity,
                            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                            REQ_POST_NOTIF
                        )
                    }
                }
                val openIntent = Intent(activity, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("openCategorizeModal", true)
                }
                val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
                val pi = PendingIntent.getActivity(activity, 201, openIntent, pendingFlags)
                val builder = NotificationCompat.Builder(activity, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pi)

                val nm = activity.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                nm?.notify((System.currentTimeMillis() % 100000).toInt(), builder.build())
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun startVoiceRecognition(lang: String): Boolean {
            return try {
                activity.startNativeVoiceRecognitionInternal(lang)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun stopVoiceRecognition(): Boolean {
            return try {
                activity.runOnUiThread {
                    activity.speechRecognizer?.stopListening()
                }
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun speakText(text: String): Boolean {
            return try {
                if (activity.ttsReady && activity.tts != null) {
                    activity.tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "edith_utt_${System.currentTimeMillis()}")
                    true
                } else {
                    false
                }
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun stopSpeak(): Boolean {
            return try {
                activity.tts?.stop()
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    companion object {
        const val CHANNEL_ID = "campus_ledger_categorize_channel"
        const val REQ_RECORD_AUDIO = 501
        const val REQ_POST_NOTIF = 502

        fun isNotificationServiceEnabled(context: Context): Boolean {
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
}
