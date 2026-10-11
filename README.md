# Campus Ledger – Android App (Capacitor + Kotlin `NotificationListenerService`)

Wraps the Campus Ledger PWA in a native Capacitor Android app and adds a custom Kotlin `NotificationListenerService` + Capacitor plugin (`NotificationInterceptor`) so Google Pay, PhonePe, Paytm, CRED, BHIM, and bank SMS notifications are streamed into the ledger automatically.

## Architecture
- [`native/MyNotificationListenerService.kt`](native/MyNotificationListenerService.kt): Extends Android's `NotificationListenerService`, extracts `package`, `android.title`, and `android.text` on `onNotificationPosted`, and broadcasts `INTERCEPTED_NOTIFICATION` via `LocalBroadcastManager`.
- [`native/NotificationInterceptorPlugin.kt`](native/NotificationInterceptorPlugin.kt): Custom `@CapacitorPlugin(name = "NotificationInterceptor")` that listens for `INTERCEPTED_NOTIFICATION` broadcasts and emits `onNotificationReceived` to JavaScript, plus `checkPermission()` and `requestPermission()` plugin methods.
- [`native/MainActivity.kt`](native/MainActivity.kt): Registers `NotificationInterceptorPlugin` with the Capacitor `BridgeActivity`.
- [`native/manifest-service.xml`](native/manifest-service.xml): Declares `MyNotificationListenerService` with `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` in `AndroidManifest.xml`.
- [`app.js`](app.js): Uses `import { registerPlugin } from '@capacitor/core'` and `NotificationInterceptor.addListener('onNotificationReceived', ...)` to classify and record incoming UPI/SMS alerts automatically.

## Build Instructions
1. Run `node setup.js` (installs Capacitor, creates `android/`, copies Kotlin sources, updates `AndroidManifest.xml`, and syncs `www/`).
2. Run `npx cap open android` to open the project in Android Studio.
3. Choose **Build > Build Bundle(s) / APK(s) > Build APK(s)** and install `app-debug.apk` on your Android phone.
4. Open Campus Ledger → Ledger tab → tap **Enable Notification Access** → toggle **Campus Ledger** ON.
