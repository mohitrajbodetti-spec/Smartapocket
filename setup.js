#!/usr/bin/env node
/**
 * One-time / repeatable setup for the Campus Ledger Capacitor Android project.
 * Run from this folder:   node setup.js
 *
 * Steps:
 *  1. Sync root PWA files into www/ (Capacitor webDir)
 *  2. Install Capacitor npm dependencies if missing
 *  3. Create the android/ project (`npx cap add android`) if missing
 *  4. Copy Kotlin native files (MainActivity.kt, MyNotificationListenerService.kt,
 *     NotificationInterceptorPlugin.kt) into android/app/src/main/java/...
 *     and remove default MainActivity.java
 *  5. Configure Kotlin & LocalBroadcastManager in Gradle files
 *  6. Register BIND_NOTIFICATION_LISTENER_SERVICE and MyNotificationListenerService
 *     in AndroidManifest.xml
 *  7. Run `npx cap sync android`
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const run = (cmd) => {
  console.log('\n> ' + cmd);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
};

// 1. Copy web app files into www/
const wwwDir = path.join(root, 'www');
fs.mkdirSync(wwwDir, { recursive: true });
const webFiles = [
  'index.html',
  'style.css',
  'app.js',
  'capacitor-core.js',
  'manifest.json',
  'service-worker.js',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png'
];
for (const file of webFiles) {
  const srcPath = path.join(root, file);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join(wwwDir, file));
  }
}
console.log('Synced web assets into www/');

// 2. Install Capacitor dependencies if needed
if (!fs.existsSync(path.join(root, 'node_modules', '@capacitor', 'android'))) {
  run('npm install');
}

// 3. Create android project if needed
if (!fs.existsSync(path.join(root, 'android'))) {
  run('npx cap add android');
}

// 4. Copy Kotlin native sources & remove generated MainActivity.java
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const pkg = cfg.appId;
const javaDir = path.join(root, 'android', 'app', 'src', 'main', 'java', ...pkg.split('.'));
fs.mkdirSync(javaDir, { recursive: true });

const oldMainJava = path.join(javaDir, 'MainActivity.java');
if (fs.existsSync(oldMainJava)) {
  fs.unlinkSync(oldMainJava);
  console.log('Removed default MainActivity.java (replaced by MainActivity.kt)');
}

const ktFiles = [
  'MainActivity.kt',
  'MyNotificationListenerService.kt',
  'NotificationInterceptorPlugin.kt'
];
for (const file of ktFiles) {
  const src = fs
    .readFileSync(path.join(root, 'native', file), 'utf8')
    .replace(/^package\s+[\w.]+/m, 'package ' + pkg);
  const dest = path.join(javaDir, file);
  fs.writeFileSync(dest, src);
  console.log('Copied ' + file + ' -> ' + path.relative(root, dest));
}

// 5. Ensure Kotlin plugin & LocalBroadcastManager are configured in Gradle
const rootGradlePath = path.join(root, 'android', 'build.gradle');
if (fs.existsSync(rootGradlePath)) {
  let rootGradle = fs.readFileSync(rootGradlePath, 'utf8');
  if (!rootGradle.includes('kotlin-gradle-plugin')) {
    rootGradle = rootGradle.replace(
      /dependencies\s*\{/,
      "dependencies {\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0'"
    );
    fs.writeFileSync(rootGradlePath, rootGradle);
    console.log('Added kotlin-gradle-plugin to android/build.gradle');
  }
}

const appGradlePath = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(appGradlePath)) {
  let appGradle = fs.readFileSync(appGradlePath, 'utf8');
  if (!appGradle.includes('kotlin-android')) {
    appGradle = appGradle.replace(
      /apply plugin:\s*['"]com\.android\.application['"]/,
      "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'"
    );
  }
  if (!appGradle.includes('kotlinOptions')) {
    appGradle = appGradle.replace(
      /buildTypes\s*\{/,
      "kotlinOptions {\n        jvmTarget = '21'\n    }\n    buildTypes {"
    );
  }
  if (!appGradle.includes('localbroadcastmanager')) {
    appGradle = appGradle.replace(
      /dependencies\s*\{/,
      "dependencies {\n    implementation \"androidx.localbroadcastmanager:localbroadcastmanager:1.1.0\""
    );
  }
  fs.writeFileSync(appGradlePath, appGradle);
  console.log('Configured kotlin-android, jvmTarget 21, and localbroadcastmanager in android/app/build.gradle');
}

// 6. Update AndroidManifest.xml with permission & MyNotificationListenerService
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');

if (!manifest.includes('BIND_NOTIFICATION_LISTENER_SERVICE')) {
  const permSnippet =
    '    <!-- Permission to bind to the notification listener -->\n' +
    '    <uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />\n';
  manifest = manifest.replace(/<\/manifest>\s*$/, permSnippet + '</manifest>\n');
}

if (!manifest.includes('RECORD_AUDIO')) {
  const voicePermSnippet =
    '    <uses-permission android:name="android.permission.RECORD_AUDIO" />\n' +
    '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />\n';
  manifest = manifest.replace(/<\/manifest>\s*$/, voicePermSnippet + '</manifest>\n');
}

if (!manifest.includes('MyNotificationListenerService')) {
  const serviceSnippet = fs.readFileSync(path.join(root, 'native', 'manifest-service.xml'), 'utf8');
  if (!manifest.includes('</application>')) {
    throw new Error('Could not find </application> in AndroidManifest.xml');
  }
  manifest = manifest.replace('</application>', '\n' + serviceSnippet + '    </application>');
  console.log('Registered MyNotificationListenerService in AndroidManifest.xml');
} else {
  console.log('AndroidManifest.xml already has MyNotificationListenerService');
}
fs.writeFileSync(manifestPath, manifest);

// 7. Sync web files into Android project
run('npx cap sync android');

console.log(`
Done! Next steps:
  1. npx cap open android      (opens Android Studio; wait for Gradle sync to finish)
  2. Build > Build Bundle(s) / APK(s) > Build APK(s)
  3. Install app-debug.apk on your Android device
  4. In the app: Ledger tab > "Enable Notification Access" and switch Campus Ledger ON.
`);
