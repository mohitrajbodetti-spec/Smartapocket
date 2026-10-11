/**
 * ============================================================================
 * Campus Ledger — Application Logic (Powered by EDITH Gemini AI)
 * Pure ES6+ JavaScript, zero dependencies.
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // Capacitor & Direct Android Native Plugin Bridge (works in APK + Web)
  // --------------------------------------------------------------------------
  const registerPlugin = function registerCapacitorPlugin(pluginName) {
    const jsListeners = new Set();

    // Hook direct WebView JavascriptInterface push from MainActivity.kt
    if (typeof window !== 'undefined') {
      window.__onCampusNotification = function (data) {
        jsListeners.forEach(cb => {
          try { cb(data); } catch (_e) { /* ignore */ }
        });
      };
    }

    function isNativeEnv() {
      if (typeof window === 'undefined') return false;
      if (window.CampusAndroid && typeof window.CampusAndroid.isNativeApp === 'function') return true;
      if (window.androidBridge) return true;
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) return true;
      return false;
    }

    return {
      addListener(eventName, callback) {
        if (eventName === 'onNotificationReceived' && typeof callback === 'function') {
          jsListeners.add(callback);
        }
        const cap = (typeof window !== 'undefined' && window.Capacitor) || {};
        if (cap.Plugins && cap.Plugins[pluginName] && typeof cap.Plugins[pluginName].addListener === 'function') {
          try { cap.Plugins[pluginName].addListener(eventName, callback); } catch (_e) { /* ignore */ }
        } else if (cap.nativeCallback) {
          try { cap.nativeCallback(pluginName, 'addListener', { eventName }, callback); } catch (_e) { /* ignore */ }
        }
        return Promise.resolve({
          remove: () => {
            jsListeners.delete(callback);
            return Promise.resolve();
          }
        });
      },

      async checkPermission(options) {
        if (typeof window !== 'undefined' && window.CampusAndroid && typeof window.CampusAndroid.checkPermission === 'function') {
          return { granted: !!window.CampusAndroid.checkPermission() };
        }
        const cap = (typeof window !== 'undefined' && window.Capacitor) || {};
        if (cap.Plugins && cap.Plugins[pluginName] && typeof cap.Plugins[pluginName].checkPermission === 'function') {
          return await cap.Plugins[pluginName].checkPermission(options || {});
        }
        if (isNativeEnv() && cap.nativePromise) {
          return await cap.nativePromise(pluginName, 'checkPermission', options || {});
        }
        return { granted: false, webFallback: !isNativeEnv() };
      },

      async requestPermission(options) {
        if (typeof window !== 'undefined' && window.CampusAndroid && typeof window.CampusAndroid.requestPermission === 'function') {
          const opened = !!window.CampusAndroid.requestPermission();
          const granted = !!window.CampusAndroid.checkPermission();
          return { opened, granted };
        }
        const cap = (typeof window !== 'undefined' && window.Capacitor) || {};
        if (cap.Plugins && cap.Plugins[pluginName] && typeof cap.Plugins[pluginName].requestPermission === 'function') {
          return await cap.Plugins[pluginName].requestPermission(options || {});
        }
        if (isNativeEnv() && cap.nativePromise) {
          return await cap.nativePromise(pluginName, 'requestPermission', options || {});
        }
        return { opened: false, granted: false, webFallback: !isNativeEnv() };
      },

      async drainPending(options) {
        if (typeof window !== 'undefined' && window.CampusAndroid && typeof window.CampusAndroid.drainPending === 'function') {
          try {
            const raw = window.CampusAndroid.drainPending();
            const arr = JSON.parse(raw || '[]');
            return { items: Array.isArray(arr) ? arr.reverse() : [] };
          } catch (_e) {
            return { items: [] };
          }
        }
        const cap = (typeof window !== 'undefined' && window.Capacitor) || {};
        if (cap.Plugins && cap.Plugins[pluginName] && typeof cap.Plugins[pluginName].drainPending === 'function') {
          return await cap.Plugins[pluginName].drainPending(options || {});
        }
        if (isNativeEnv() && cap.nativePromise) {
          return await cap.nativePromise(pluginName, 'drainPending', options || {});
        }
        return { items: [] };
      }
    };
  };

  const NotificationInterceptor = registerPlugin('NotificationInterceptor');

  // --------------------------------------------------------------------------
  // Constants & Configuration
  // --------------------------------------------------------------------------
  const MAX_ATTEMPTS = 5;
  const LOCK_MS = 30000;
  const DAY = 86400000;

  // Database key for Gemini API
  const DB_GEMINI_KEY_STORAGE = 'cl_gemini_api_key';

  const DEFAULT_BUDGET_LIMITS = {
    'Food & Dining': 4500,
    'Travel & Commute': 2000,
    'Books & Academics': 2500,
    'Entertainment & Outings': 1800,
    'Shopping': 2000,
    'Bills & Utilities': 1200,
    'Emergency / Health': 1000
  };

  const CATEGORY_ICONS = {
    'Food & Dining': '🍔',
    'Travel & Commute': '🚕',
    'Books & Academics': '📚',
    'Entertainment & Outings': '🍿',
    'Shopping': '🛍️',
    'Bills & Utilities': '⚡',
    'Emergency / Health': '💊',
    'Allowance': '💰',
    'Savings Goal': '🎯'
  };

  const ROLE_ICONS = { Student: '🎓', Parent: '👨‍💼', Bank: '🏦', Cash: '💵', Shared: '🤝' };

  const NEEDS_CATS = ['Food & Dining', 'Bills & Utilities', 'Books & Academics'];
  const WANTS_CATS = ['Entertainment & Outings', 'Shopping', 'Travel & Commute'];

  const CATEGORY_KEYWORDS = {
    'Food & Dining': ['food', 'dinner', 'lunch', 'breakfast', 'eat', 'eating', 'swiggy', 'zomato', 'canteen', 'chai', 'tea', 'coffee', 'pizza', 'burger', 'biryani', 'snack', 'snacks', 'mess', 'restaurant', 'dining', 'meal', 'khana', 'bakery', 'cafe'],
    'Travel & Commute': ['transport', 'travel', 'commute', 'uber', 'ola', 'rapido', 'cab', 'cabs', 'taxi', 'metro', 'bus', 'train', 'fuel', 'petrol', 'ride', 'rides', 'auto', 'irctc'],
    'Books & Academics': ['book', 'books', 'academic', 'academics', 'study', 'xerox', 'stationery', 'notes', 'exam', 'tuition', 'library', 'print', 'college', 'course'],
    'Entertainment & Outings': ['entertainment', 'movie', 'movies', 'cinema', 'pvr', 'outing', 'outings', 'party', 'game', 'games', 'netflix', 'concert', 'fun', 'spotify', 'bookmyshow'],
    'Shopping': ['shopping', 'clothes', 'shirt', 'shoes', 'amazon', 'flipkart', 'myntra', 'gadget', 'gadgets', 'headphones', 'headphone', 'accessories', 'meesho', 'ajio'],
    'Bills & Utilities': ['bill', 'bills', 'utility', 'utilities', 'recharge', 'electricity', 'wifi', 'internet', 'rent', 'subscription', 'airtel', 'jio', 'vi', 'bsnl'],
    'Emergency / Health': ['health', 'medical', 'medicine', 'doctor', 'emergency', 'hospital', 'pharmacy', 'apollo', 'medplus', 'clinic']
  };

  const KNOWN_MERCHANTS = [
    { k: 'swiggy', n: 'Swiggy', c: 'Food & Dining' },
    { k: 'zomato', n: 'Zomato', c: 'Food & Dining' },
    { k: 'canteen|mess', n: 'Campus Canteen', c: 'Food & Dining' },
    { k: 'dominos?|pizza\\s*hut|kfc|mcdonalds?|burger\\s*king|starbucks|ccd', n: 'Restaurant / Cafe', c: 'Food & Dining' },
    { k: 'uber', n: 'Uber Ride', c: 'Travel & Commute' },
    { k: 'ola', n: 'Ola Cabs', c: 'Travel & Commute' },
    { k: 'rapido', n: 'Rapido', c: 'Travel & Commute' },
    { k: 'metro', n: 'Metro Smart Card', c: 'Travel & Commute' },
    { k: 'irctc', n: 'IRCTC Rail', c: 'Travel & Commute' },
    { k: 'books?|stationery', n: 'Campus Book Store', c: 'Books & Academics' },
    { k: 'library', n: 'Library', c: 'Books & Academics' },
    { k: 'xerox|printout', n: 'Xerox & Print', c: 'Books & Academics' },
    { k: 'pvr|inox', n: 'PVR / INOX Cinemas', c: 'Entertainment & Outings' },
    { k: 'bookmyshow', n: 'BookMyShow', c: 'Entertainment & Outings' },
    { k: 'netflix|spotify|prime\\s*video', n: 'Streaming Subscription', c: 'Entertainment & Outings' },
    { k: 'amazon', n: 'Amazon', c: 'Shopping' },
    { k: 'flipkart', n: 'Flipkart', c: 'Shopping' },
    { k: 'myntra|ajio|meesho', n: 'Fashion Shopping', c: 'Shopping' },
    { k: 'airtel', n: 'Airtel Recharge', c: 'Bills & Utilities' },
    { k: 'jio', n: 'Jio Recharge', c: 'Bills & Utilities' },
    { k: 'electricity|bescom|mahadiscom|tneb', n: 'Electricity Bill', c: 'Bills & Utilities' },
    { k: 'pharmacy|apollo|medplus|pharmeasy|1mg', n: 'Pharmacy / Medical', c: 'Emergency / Health' }
  ];

  const ITEM_PRICES = {
    dinner: 220, lunch: 120, breakfast: 60, coffee: 80, chai: 20, tea: 20, pizza: 350, biryani: 250,
    burger: 150, snacks: 80, movie: 450, headphones: 4000, headphone: 4000, earbuds: 1500, phone: 15000,
    laptop: 45000, shoes: 2000, shirt: 900, jeans: 1500, book: 500, books: 650, cab: 180, uber: 180,
    ride: 150, haircut: 200, gift: 1000, party: 1000
  };

  // Strict Listener Filtering Constants:
  // Only allow PhonePe, Google Pay, Paytm, RuPay, FamPay/FanPay, UPI notifications, and SMS with Bank names
  const BLOCKED_APP_PACKAGES = new Set([
    'com.whatsapp',
    'com.whatsapp.w4b',
    'org.telegram.messenger',
    'com.instagram.android',
    'com.facebook.orca',
    'com.facebook.katana',
    'com.snapchat.android',
    'com.discord',
    'com.twitter.android',
    'com.google.android.youtube',
    'com.google.android.gm',
    'com.spotify.music'
  ]);

  const ALLOWED_PAYMENT_APP_PACKAGES = {
    'com.phonepe.app': 'PhonePe',
    'com.phonepe.app.business': 'PhonePe',
    'com.google.android.apps.nbu.paisa.user': 'Google Pay',
    'net.one97.paytm': 'Paytm',
    'com.paytm.business': 'Paytm',
    'com.fampay.in': 'FamPay',
    'in.fampay.app': 'FamPay',
    'in.org.npci.upiapp': 'BHIM UPI'
  };

  const SMS_APP_PACKAGES = new Set([
    'com.google.android.apps.messaging',
    'com.samsung.android.messaging',
    'com.android.mms',
    'com.android.messaging',
    'com.miui.mms',
    'com.oneplus.mms',
    'com.coloros.mcs',
    'com.vivo.message',
    'com.oppo.mms',
    'com.asus.message',
    'com.motorola.messaging',
    'com.sonyericsson.conversations'
  ]);

  const ALLOWED_PAYMENT_BRANDS_RX = /\b(phonepe|phonepay|google\s*pay|googlepay|gpay|paytm|rupay|fampay|fanpay|bhim|upi|vpa)\b/i;

  const BANK_NAMES_RX = /\b(sbi|state\s+bank|hdfc|icici|axis|kotak|boi|bank\s+of\s+india|bob|bank\s+of\s+baroda|pnb|punjab\s+national|canara|union\s+bank|ubi|idfc|indusind|yes\s+bank|federal\s+bank|indian\s+bank|central\s+bank|uco\s+bank|bank\s+of\s+maharashtra|bom|iob|indian\s+overseas|punjab\s*&\s*sind|south\s+indian\s+bank|sib|karur\s+vysya|kvb|city\s+union|cub|rbl|bandhan|idbi|au\s+bank|au\s+small\s+finance|equitas|ujjivan|jana\s+bank|saraswat|cosmos|dbs|standard\s+chartered|citi|citibank|hsbc|deutsche|karnataka\s+bank|tamilnad\s+mercantile|tmb|nainital\s+bank|dhanlaxmi|csb\s+bank|j&k\s+bank|jammu\s*&\s*kashmir\s+bank|paytm\s+payments\s+bank|airtel\s+payments\s+bank|india\s+post\s+payments\s+bank|ippb|fino|fi\s+money|jupiter|bank|a\/c|acct)\b/i;

  // Ignore OTPs / promotional offers so they never trigger transaction logging
  const PROMO_OR_OTP_RX = /\b(otp\s+is|one\s+time\s+password|verification\s+code|use\s+code|promo\s+code|cashback\s+up\s+to|get\s+flat|win\s+up\s+to|pre-?approved\s+loan|apply\s+now)\b/i;

  const LEGACY_DEMO_IDS = new Set(['usr-student-01', 'usr-parent-02', 'usr-bank-03']);

  // --------------------------------------------------------------------------
  // Small utilities
  // --------------------------------------------------------------------------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fmt = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  const cap = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ }
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
  const dataKey = id => 'cl_data_' + id;

  function getDatabaseGeminiKey() {
    const acctKey = (state.data && state.data.edith && state.data.edith.geminiApiKey) || '';
    const globalKey = lsGet(DB_GEMINI_KEY_STORAGE, '') || '';
    return (acctKey || globalKey || '').trim();
  }

  function setDatabaseGeminiKey(key) {
    const clean = (key || '').trim();
    lsSet(DB_GEMINI_KEY_STORAGE, clean);
    if (state.data && state.data.edith) {
      state.data.edith.geminiApiKey = clean;
      saveData();
    }
  }

  // --------------------------------------------------------------------------
  // Password hashing (SHA-256 + salt; simple fallback if SubtleCrypto missing)
  // --------------------------------------------------------------------------
  function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  function makeSalt() {
    try {
      const a = new Uint8Array(8);
      crypto.getRandomValues(a);
      return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return Math.random().toString(16).slice(2, 12);
    }
  }

  async function hashPassword(pw, salt, kind) {
    const data = salt + ':' + pw;
    const useSha = kind ? kind === 'sha256' : !!(window.crypto && crypto.subtle);
    if (useSha && window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
        return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) { /* fall through */ }
    }
    return 'c53:' + cyrb53(data).toString(16);
  }

  async function verifyPassword(acc, pw) {
    const kind = (acc.passHash || '').startsWith('sha256:') ? 'sha256' : 'c53';
    return (await hashPassword(pw, acc.salt, kind)) === acc.passHash;
  }

  // --------------------------------------------------------------------------
  // Per-account data model (Manual Balance Only, No Demo Data)
  // --------------------------------------------------------------------------
  function defaultData(opening) {
    const o = Number(opening) || 0;
    return {
      openingBalance: o,
      balanceMode: 'manual',
      manualBalance: o,
      transactions: [],
      pendingTransactions: [],
      budgetLimits: { ...DEFAULT_BUDGET_LIMITS },
      goals: [],
      reminders: [],
      notifications: [],
      unread: 0,
      edith: {
        aliases: {},
        unanswered: [],
        geminiApiKey: lsGet(DB_GEMINI_KEY_STORAGE, '') || '',
        lastInteractionId: null
      }
    };
  }

  function normalizeData(raw, opening) {
    const base = defaultData(opening);
    const d = { ...base, ...(raw || {}) };
    d.balanceMode = 'manual';
    if (d.manualBalance == null || !isFinite(Number(d.manualBalance))) {
      d.manualBalance = Number(d.openingBalance) || Number(opening) || 0;
    } else {
      d.manualBalance = Number(d.manualBalance);
    }
    d.edith = { ...base.edith, ...((raw && raw.edith) || {}) };
    d.edith.aliases = d.edith.aliases || {};
    d.edith.unanswered = d.edith.unanswered || [];
    if (!d.edith.geminiApiKey) {
      d.edith.geminiApiKey = lsGet(DB_GEMINI_KEY_STORAGE, '') || '';
    }
    ['transactions', 'pendingTransactions', 'goals', 'reminders', 'notifications'].forEach(k => {
      if (!Array.isArray(d[k])) d[k] = [];
    });
    d.budgetLimits = d.budgetLimits || { ...DEFAULT_BUDGET_LIMITS };
    return d;
  }

  // --------------------------------------------------------------------------
  // Application state
  // --------------------------------------------------------------------------
  const state = {
    accounts: [],
    currentId: null,
    isLoggedIn: false,
    data: defaultData(0),
    loginTargetId: null,
    editingTxId: null,
    activePendingTxId: null,
    activeGoalId: null,
    openMenuTxId: null,
    attempts: {},
    activeTab: 'slide-1',
    activeFilter: 'all',
    searchQuery: '',
    isDarkMode: lsGet('cl_theme', 'dark') !== 'light',
    ttsEnabled: true,
    isListeningVoice: false,
    chatMessages: [],
    edithCtx: null
  };

  const acct = () => state.accounts.find(a => a.id === state.currentId) || null;
  const D = () => state.data;

  function saveAccounts() { lsSet('cl_accounts', state.accounts); }
  function saveData() { if (state.isLoggedIn && state.currentId) lsSet(dataKey(state.currentId), state.data); }
  function saveSession(loggedOutExplicitly = false) {
    lsSet('cl_session', { isLoggedIn: state.isLoggedIn, lastId: state.currentId, loggedOutExplicitly });
  }
  function savePrefs() { lsSet('cl_theme', state.isDarkMode ? 'dark' : 'light'); }

  function loadAccountData(acc) {
    let raw = lsGet(dataKey(acc.id), null);
    if (!raw) {
      raw = defaultData(acc.allowance);
      lsSet(dataKey(acc.id), raw);
    }
    return normalizeData(raw, acc.allowance);
  }

  async function bootstrap() {
    LEGACY_DEMO_IDS.forEach(demoId => lsRemove(dataKey(demoId)));

    let accs = lsGet('cl_accounts', []);
    if (!Array.isArray(accs)) accs = [];
    accs = accs.filter(a => a && a.id && !LEGACY_DEMO_IDS.has(a.id) && a.passHash);

    for (const a of accs) {
      a.allowance = Number(a.allowance) || 0;
      a.savingsTarget = Number(a.savingsTarget) || 0;
      a.icon = a.icon || ROLE_ICONS[a.role] || '👤';
      delete a.passwordMasked;
      delete a.balance;
    }
    state.accounts = accs;
    saveAccounts();

    accs.forEach(a => {
      const normalized = loadAccountData(a);
      lsSet(dataKey(a.id), normalized);
    });

    if (accs.length === 0) {
      state.currentId = null;
      state.isLoggedIn = false;
      state.data = defaultData(0);
      saveSession(false);
      return;
    }

    const sess = lsGet('cl_session', {});
    const last = accs.find(a => a.id === sess.lastId) || accs[0];
    state.currentId = last.id;

    if (!sess.loggedOutExplicitly) {
      state.isLoggedIn = true;
      state.data = loadAccountData(last);
      resetChat();
      saveSession(false);
    } else {
      state.isLoggedIn = false;
      state.data = defaultData(0);
    }
  }

  // --------------------------------------------------------------------------
  // Audio / confetti / toast / clipboard
  // --------------------------------------------------------------------------
  function playAudioChime(type = 'success') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(330, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) { /* autoplay policy */ }
  }

  function launchConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#F59E0B', '#10B981', '#6366F1', '#EC4899', '#3B82F6'];
    const particles = Array.from({ length: 70 }, () => ({
      x: canvas.width / 2, y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16, vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4, color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360, vr: (Math.random() - 0.5) * 10, alpha: 1
    }));
    let frame = 0;
    (function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.alpha -= 0.015; p.rotation += p.vr;
        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      }
      frame++;
      if (alive && frame < 120) requestAnimationFrame(render);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    })();
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function copyTextToUserClipboard(text) {
    try {
      if (window.CampusAndroid && typeof window.CampusAndroid.copyToClipboard === 'function') {
        window.CampusAndroid.copyToClipboard(text);
      }
    } catch (_e) { /* ignore */ }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    } catch (_e) { /* ignore */ }
  }

  function sendNativeUserNotification(title, message) {
    try {
      if (window.CampusAndroid && typeof window.CampusAndroid.sendUserNotification === 'function') {
        window.CampusAndroid.sendUserNotification(title, message);
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: message });
      }
    } catch (_e) { /* ignore */ }
  }

  // --------------------------------------------------------------------------
  // Date helpers
  // --------------------------------------------------------------------------
  function periodRange(key) {
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (key) {
      case 'today': return [sod, sod + DAY];
      case 'yesterday': return [sod - DAY, sod];
      case 'week': return [sod - 6 * DAY, sod + DAY];
      case 'lastmonth': return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime()];
      default: return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()];
    }
  }
  const PERIOD_LABEL = { today: 'today', yesterday: 'yesterday', week: 'in the last 7 days', month: 'this month', lastmonth: 'last month' };

  function inRange(t, key) {
    if (!t.ts) return key === 'month';
    const [a, b] = periodRange(key);
    return t.ts >= a && t.ts < b;
  }
  const monthTx = () => D().transactions.filter(t => inRange(t, 'month'));
  const sum = arr => arr.reduce((s, t) => s + t.amount, 0);

  function formatTxDate(tx) {
    if (!tx.ts) return tx.date || '';
    const d = new Date(tx.ts);
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (tx.ts >= sod) return 'Today, ' + time;
    if (tx.ts >= sod - DAY) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function prettyDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return s || 'Soon';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  // --------------------------------------------------------------------------
  // Financial calculations (per active account)
  // --------------------------------------------------------------------------
  function computeBalance(data) {
    return Math.max(0, Number(data && data.manualBalance) || 0);
  }

  function calculateFinancials() {
    const tx = monthTx();
    const totalExpenses = sum(tx.filter(t => t.type === 'debit'));
    const totalIncome = sum(tx.filter(t => t.type === 'credit'));
    const a = acct();
    const allowance = a ? a.allowance : 0;
    const balance = computeBalance(D());
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(1, totalDays - now.getDate());
    const safeDailyLimit = Math.round(Math.max(0, balance) / daysRemaining);
    return { totalExpenses, totalIncome, allowance, balance, daysRemaining, totalDays, safeDailyLimit };
  }

  function get503020() {
    const fin = calculateFinancials();
    const tx = monthTx().filter(t => t.type === 'debit');
    const needs = sum(tx.filter(t => NEEDS_CATS.includes(t.category)));
    const wants = sum(tx.filter(t => WANTS_CATS.includes(t.category)));
    const base = Math.max(fin.allowance, needs + wants, 1);
    const pNeeds = Math.round((needs / base) * 100);
    const pWants = Math.round((wants / base) * 100);
    const pSavings = Math.max(0, 100 - pNeeds - pWants);
    return { needs, wants, savings: Math.max(0, base - needs - wants), pNeeds, pWants, pSavings };
  }

  const spendByCategory = (key = 'month') => {
    const m = {};
    D().transactions.filter(t => t.type === 'debit' && inRange(t, key)).forEach(t => { m[t.category] = (m[t.category] || 0) + t.amount; });
    return m;
  };
  const upcomingDues = () => D().reminders.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // --------------------------------------------------------------------------
  // Rendering
  // --------------------------------------------------------------------------
  function renderAll() {
    renderThemeAndLayout();
    renderHeader();
    renderSlide1();
    renderSlide2();
    renderSlide3();
    renderSlide4();
    renderLoginAccountPills();
  }

  function renderThemeAndLayout() {
    const html = document.documentElement;
    const appContainer = document.getElementById('appContainer');
    const themeIcon = document.getElementById('themeIcon');
    html.classList.toggle('dark', state.isDarkMode);
    if (themeIcon) themeIcon.textContent = state.isDarkMode ? '☀️' : '🌙';
    if (appContainer) {
      appContainer.classList.remove('mobile-frame-mode');
      appContainer.classList.toggle('locked', !state.isLoggedIn);
    }
  }

  function renderHeader() {
    const userGreeting = document.getElementById('userGreeting');
    const authBox = document.getElementById('authHeaderBtnContainer');
    const a = acct();
    if (userGreeting) {
      userGreeting.textContent = state.isLoggedIn && a ? `Hi, ${a.name.split(' ')[0]} 👋` : 'Logged Out';
    }
    if (authBox) {
      if (state.isLoggedIn) {
        authBox.innerHTML = '<button id="headerLogoutBtn" class="btn-icon logout-icon" title="Log Out & Switch Account">🔒</button>';
        document.getElementById('headerLogoutBtn').addEventListener('click', openLogoutConfirmModal);
      } else {
        authBox.innerHTML = '<button id="headerLoginBtn" class="btn-amber" style="padding: 6px 12px; font-size: 0.75rem;">Sign In</button>';
        document.getElementById('headerLoginBtn').addEventListener('click', () => {
          if (state.accounts.length === 0) openCreateAccountModal(true);
          else openLoginModal();
        });
      }
    }
    const badge = document.getElementById('notifBadge');
    if (badge) {
      const pendingCount = state.isLoggedIn && Array.isArray(D().pendingTransactions) ? D().pendingTransactions.length : 0;
      const n = state.isLoggedIn ? (D().unread || 0) + pendingCount : 0;
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.toggle('hidden', n <= 0);
    }
  }

  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

  function renderSlide1() {
    const fin = calculateFinancials();
    setText('metricBalance', fin.balance.toLocaleString('en-IN'));
    setText('balanceModeLabel', 'Set Balance');
    setText('balanceFootText', 'Updates on transactions');
    setText('metricAllowance', fin.allowance.toLocaleString('en-IN'));
    setText('metricSpent', fin.totalExpenses.toLocaleString('en-IN'));
    setText('spendPctBadge', `${Math.round((fin.totalExpenses / (fin.allowance || 1)) * 100)}%`);
    setText('metricDailySafe', fin.safeDailyLimit.toLocaleString('en-IN'));
    setText('metricDaysRemaining', fin.daysRemaining);

    const spent = spendByCategory('month');
    let worst = null;
    Object.entries(D().budgetLimits).forEach(([cat, limit]) => {
      const ratio = limit > 0 ? (spent[cat] || 0) / limit : 0;
      if (ratio >= 0.8 && (!worst || ratio > worst.ratio)) worst = { cat, ratio, spent: spent[cat] || 0, limit };
    });
    const banner = document.getElementById('budgetWarningBanner');
    if (banner) {
      banner.classList.toggle('hidden', !worst);
      if (worst) setText('budgetWarningText', `${worst.cat} has reached ${(worst.ratio * 100).toFixed(0)}% of its limit (${fmt(worst.spent)} / ${fmt(worst.limit)})!`);
    }
    renderPendingTransactionsCard();
    renderTransactionList();
  }

  function renderPendingTransactionsCard() {
    const card = document.getElementById('pendingTxCard');
    const listEl = document.getElementById('pendingTxListContainer');
    const badgeEl = document.getElementById('pendingTxCountBadge');
    if (!card || !listEl) return;

    const pending = state.isLoggedIn && Array.isArray(D().pendingTransactions) ? D().pendingTransactions : [];
    card.classList.toggle('hidden', pending.length === 0);
    if (badgeEl) badgeEl.textContent = `${pending.length} Pending`;
    if (pending.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = pending.map(item => `
      <div class="pending-tx-item">
        <div class="pending-tx-info">
          <div class="pending-tx-title">
            <span>${fmt(item.amount)}</span>
            <span class="badge-amber">${esc(item.app)}</span>
          </div>
          <div class="pending-tx-raw">${esc(item.text)}</div>
        </div>
        <div class="pending-tx-actions">
          <button type="button" class="btn-amber categorize-pending-btn" data-id="${esc(item.id)}" style="padding: 7px 14px; font-size: 0.78rem;">📋 Categorize &amp; Log</button>
          <button type="button" class="tx-delete-btn dismiss-pending-btn" data-id="${esc(item.id)}" title="Dismiss">🗑️</button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.categorize-pending-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        openCategorizeModal(e.currentTarget.getAttribute('data-id'));
      });
    });
    listEl.querySelectorAll('.dismiss-pending-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = e.currentTarget.getAttribute('data-id');
        D().pendingTransactions = D().pendingTransactions.filter(p => p.id !== id);
        saveData();
        renderAll();
        showToast('Pending clipboard alert dismissed');
      });
    });
  }

  function renderTransactionList() {
    const container = document.getElementById('txListContainer');
    if (!container) return;
    let list = [...D().transactions];
    if (state.activeFilter !== 'all') list = list.filter(t => t.type === state.activeFilter);
    const q = state.searchQuery.trim().toLowerCase();
    if (q) list = list.filter(t => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));

    if (!state.isLoggedIn) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-mute);font-size:0.85rem;">Sign in to view your ledger.</div>';
      return;
    }
    if (!list.length) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-mute);font-size:0.85rem;">No transactions recorded yet.</div>';
      return;
    }
    container.innerHTML = list.map(tx => {
      const credit = tx.type === 'credit';
      const menuOpen = state.openMenuTxId === tx.id;
      return `
        <div class="tx-item">
          <div class="tx-item-left">
            <div class="tx-category-icon">${CATEGORY_ICONS[tx.category] || '💸'}</div>
            <div>
              <div class="tx-merchant">${esc(tx.merchant)}</div>
              <div class="tx-meta">${esc(tx.category)} • ${esc(formatTxDate(tx))}</div>
            </div>
          </div>
          <div class="tx-item-right">
            <span class="tx-amount ${credit ? 'text-emerald' : 'text-rose'}">${credit ? '+' : '-'}${fmt(tx.amount)}</span>
            <div class="tx-menu-wrap">
              <button type="button" class="tx-menu-trigger ${menuOpen ? 'open' : ''}" data-id="${esc(tx.id)}" title="More options" aria-label="Transaction options">&#8942;</button>
              <div class="tx-dropdown-menu ${menuOpen ? '' : 'hidden'}" data-menu-id="${esc(tx.id)}">
                <button type="button" class="tx-dropdown-item edit-opt" data-id="${esc(tx.id)}">✏️ Edit</button>
                <button type="button" class="tx-dropdown-item delete-opt" data-id="${esc(tx.id)}">🗑️ Delete</button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.tx-menu-trigger').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        state.openMenuTxId = state.openMenuTxId === id ? null : id;
        renderTransactionList();
      });
    });

    container.querySelectorAll('.tx-dropdown-item.edit-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        state.openMenuTxId = null;
        openEditTransactionModal(id);
      });
    });

    container.querySelectorAll('.tx-dropdown-item.delete-opt').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = e.currentTarget.getAttribute('data-id');
        state.openMenuTxId = null;
        deleteTransaction(id);
      });
    });
  }

  function renderSlide2() {
    render503020Rule();
    renderDonutChart();
    renderTrendBars();
    renderCategoryBudgets();
  }

  function render503020Rule() {
    const r = get503020();
    const set = (barId, p, label) => {
      const el = document.getElementById(barId);
      if (el) { el.style.width = `${p}%`; el.textContent = p >= 12 ? `${label} ${p}%` : ''; }
    };
    set('barNeeds', r.pNeeds, 'Needs');
    set('barWants', r.pWants, 'Wants');
    set('barSavings', r.pSavings, 'Savings');
    setText('valNeeds', `${fmt(r.needs)} (${r.pNeeds}%)`);
    setText('valWants', `${fmt(r.wants)} (${r.pWants}%)`);
    setText('valSavings', `${fmt(r.savings)} (${r.pSavings}%)`);
  }

  function renderDonutChart() {
    const svg = document.getElementById('categoryDonutSvg');
    const legend = document.getElementById('donutLegend');
    if (!svg || !legend) return;
    const catMap = spendByCategory('month');
    const cats = Object.keys(catMap);
    const total = Object.values(catMap).reduce((s, v) => s + v, 0);
    if (!total) {
      svg.innerHTML = '<circle cx="50" cy="50" r="35" fill="none" stroke="var(--surface-3)" stroke-width="12" />';
      legend.innerHTML = '<div class="text-mute text-xs">No expense data yet</div>';
      return;
    }
    const colors = ['#F59E0B', '#10B981', '#6366F1', '#EC4899', '#3B82F6', '#8B5CF6', '#14B8A6'];
    const radius = 35;
    const circ = 2 * Math.PI * radius;
    let offset = 0, circles = '', leg = '';
    cats.forEach((cat, i) => {
      const amt = catMap[cat];
      const pct = amt / total;
      const dash = pct * circ;
      const color = colors[i % colors.length];
      circles += `<circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="12" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)" />`;
      leg += `<div class="legend-item"><div style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:${color};"></span><span>${esc(cat)}</span></div><strong>${fmt(amt)} (${Math.round(pct * 100)}%)</strong></div>`;
      offset += dash;
    });
    svg.innerHTML = circles;
    legend.innerHTML = leg;
  }

  function renderTrendBars() {
    const wrap = document.getElementById('trendBarChart');
    if (!wrap) return;
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const start = sod - i * DAY;
      const label = new Date(start).toLocaleDateString('en-US', { weekday: 'short' });
      const value = sum(D().transactions.filter(t => t.type === 'debit' && t.ts && t.ts >= start && t.ts < start + DAY));
      days.push({ label, value });
    }
    const max = Math.max(...days.map(d => d.value), 1);
    wrap.innerHTML = days.map(d => `
      <div class="trend-bar-col">
        <div class="trend-bar" style="height:${Math.round((d.value / max) * 100)}%;" title="${fmt(d.value)}"></div>
        <span class="trend-bar-label">${d.label}</span>
      </div>`).join('');
  }

  function renderCategoryBudgets() {
    const container = document.getElementById('categoryBudgetsContainer');
    if (!container) return;
    const spent = spendByCategory('month');
    container.innerHTML = Object.entries(D().budgetLimits).map(([cat, limit]) => {
      const s = spent[cat] || 0;
      const raw = limit > 0 ? Math.round((s / limit) * 100) : 0;
      const pct = Math.min(100, raw);
      const color = raw >= 85 ? 'rose' : raw >= 70 ? 'amber' : 'green';
      return `
        <div class="cat-budget-card">
          <div class="cat-budget-header">
            <span>${esc(cat)}</span>
            <span class="text-${color === 'green' ? 'emerald' : color}">${fmt(s)} / ${fmt(limit)}</span>
          </div>
          <div class="cat-progress-bg"><div class="cat-progress-fill ${color}" style="width:${pct}%;"></div></div>
          <div style="font-size:0.72rem;color:var(--text-mute);display:flex;justify-content:space-between;align-items:center;">
            <span>${raw}% consumed</span>
            <span>${fmt(Math.max(0, limit - s))} left <button class="tx-delete-btn edit-limit-btn" data-cat="${esc(cat)}" title="Edit limit" style="opacity:.8">✏️</button></span>
          </div>
        </div>`;
    }).join('');
    container.querySelectorAll('.edit-limit-btn').forEach(btn => {
      btn.addEventListener('click', e => editBudgetLimit(e.currentTarget.getAttribute('data-cat')));
    });
  }

  function editBudgetLimit(cat) {
    if (!state.isLoggedIn || !(cat in D().budgetLimits)) return;
    const input = prompt(`New monthly limit for ${cat} (₹):`, D().budgetLimits[cat]);
    if (input === null) return;
    const val = parseFloat(input);
    if (!isFinite(val) || val < 0) { showToast('Enter a valid amount'); return; }
    D().budgetLimits[cat] = Math.round(val);
    saveData();
    renderAll();
    showToast(`${cat} limit set to ${fmt(val)}`);
  }

  function renderSlide3() {
    renderChatThread();
    renderGoals();
    renderReminders();
  }

  function formatRich(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function renderChatThread() {
    const thread = document.getElementById('chatMessages');
    if (!thread) return;
    thread.innerHTML = state.chatMessages.map(msg => `
      <div class="chat-bubble ${msg.sender}">
        <div>${msg.sender === 'ai' ? formatRich(msg.text) : esc(msg.text)}</div>
        ${msg.card || ''}
      </div>`).join('');
    thread.scrollTop = thread.scrollHeight;
  }

  function renderGoals() {
    const container = document.getElementById('goalsContainer');
    if (!container) return;
    if (!D().goals.length) {
      container.innerHTML = '<div class="text-mute" style="font-size:0.82rem;">No goals yet. Tap “+ New Goal”.</div>';
      return;
    }
    container.innerHTML = D().goals.map(g => {
      const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
      const remaining = Math.max(0, g.target - g.saved);
      return `
        <div class="goal-card">
          <div class="goal-header">
            <span>${esc(g.icon || '🎯')} ${esc(g.title)}</span>
            <span class="text-amber">${fmt(g.saved)} / ${fmt(g.target)}</span>
          </div>
          <div class="cat-progress-bg" style="margin:8px 0;"><div class="cat-progress-fill amber" style="width:${pct}%;"></div></div>
          <div class="goal-actions-row">
            <span style="font-size:0.72rem;color:var(--text-mute);">${pct}% (${remaining > 0 ? fmt(remaining) + ' to go' : 'Goal Completed! 🎉'})</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <button type="button" class="btn-amber add-money-goal-btn" data-id="${esc(g.id)}" style="padding: 6px 14px; font-size: 0.78rem;">+ Add</button>
              <button type="button" class="tx-delete-btn delete-goal-btn" data-id="${esc(g.id)}" title="Delete Goal">🗑️</button>
            </div>
          </div>
        </div>`;
    }).join('');
    container.querySelectorAll('.add-money-goal-btn').forEach(btn => {
      btn.addEventListener('click', e => openContributeGoalModal(e.currentTarget.getAttribute('data-id')));
    });
    container.querySelectorAll('.delete-goal-btn').forEach(btn => {
      btn.addEventListener('click', e => deleteGoal(e.currentTarget.getAttribute('data-id')));
    });
  }

  function renderReminders() {
    const container = document.getElementById('remindersContainer');
    if (!container) return;
    if (!D().reminders.length) {
      container.innerHTML = '<div class="text-mute" style="font-size:0.82rem;">No reminders. Tap “+ Add Reminder”.</div>';
      return;
    }
    container.innerHTML = D().reminders.map(r => `
      <div class="reminder-item">
        <div><strong>${esc(r.title)}</strong><div style="font-size:0.72rem;color:var(--text-mute);">Due: ${esc(prettyDate(r.date))}</div></div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${r.amount > 0 ? `<span class="text-amber font-bold">${fmt(r.amount)}</span>` : '<span class="text-mute">Notice</span>'}
          <button class="tx-delete-btn delete-reminder-btn" data-id="${esc(r.id)}">🗑️</button>
        </div>
      </div>`).join('');
    container.querySelectorAll('.delete-reminder-btn').forEach(btn => {
      btn.addEventListener('click', e => deleteReminder(e.currentTarget.getAttribute('data-id')));
    });
  }

  function renderSlide4() {
    renderProfileCard();
    renderAccountsGrid();
    const field = document.getElementById('manualBalanceField');
    if (field) field.value = computeBalance(D());
  }

  function renderProfileCard() {
    const a = acct();
    const on = state.isLoggedIn && a;
    setText('profName', on ? a.name : 'Not signed in');
    setText('profEmail', on ? a.email : 'Create or sign in to an account');
    setText('profRoleBadge', on ? `${a.role} Account` : 'Logged out');
    setText('profAvatar', on ? (a.icon || '👤') : '🔒');
  }

  function renderAccountsGrid() {
    const container = document.getElementById('accountsListContainer');
    if (!container) return;
    if (!state.accounts.length) {
      container.innerHTML = '<div class="text-mute" style="font-size:0.82rem;">No accounts created yet. Tap “+ New Account”.</div>';
      return;
    }
    container.innerHTML = state.accounts.map(acc => {
      const isCurrent = state.isLoggedIn && acc.id === state.currentId;
      const badge = acc.role === 'Student' ? 'badge-amber' : acc.role === 'Parent' ? 'badge-rose' : 'badge-emerald';
      const bal = computeBalance(acc.id === state.currentId && state.isLoggedIn ? D() : normalizeData(lsGet(dataKey(acc.id), null), acc.allowance));
      return `
        <div class="account-card ${isCurrent ? 'active' : ''}">
          <div class="account-card-left">
            <div class="account-card-avatar">${esc(acc.icon || '👤')}</div>
            <div class="account-card-info">
              <div class="account-card-name">${esc(acc.name)}</div>
              <div class="account-card-meta"><span class="${badge}">${esc(acc.role)}</span><span>• Allowance: ${fmt(acc.allowance)}</span></div>
            </div>
          </div>
          <div class="account-card-right">
            <div class="account-card-balance">${fmt(bal)}</div>
            ${isCurrent ? '<span class="account-badge-active">Active</span>' : `
              <div style="display:flex;gap:4px;align-items:center;">
                <button class="account-btn-switch switch-acc-btn" data-id="${esc(acc.id)}">Switch</button>
                ${state.accounts.length > 1 ? `<button class="tx-delete-btn delete-acc-btn" data-id="${esc(acc.id)}" title="Remove Account">🗑️</button>` : ''}
              </div>`}
          </div>
        </div>`;
    }).join('');
    container.querySelectorAll('.switch-acc-btn').forEach(btn => {
      btn.addEventListener('click', e => openLoginModal(e.currentTarget.getAttribute('data-id')));
    });
    container.querySelectorAll('.delete-acc-btn').forEach(btn => {
      btn.addEventListener('click', e => deleteAccount(e.currentTarget.getAttribute('data-id')));
    });
  }

  function renderLoginAccountPills() {
    const container = document.getElementById('loginAccountsPillsContainer');
    if (!container) return;
    container.innerHTML = state.accounts.map(acc => `
      <button type="button" class="profile-select-pill ${acc.id === state.loginTargetId ? 'active' : ''}" data-id="${esc(acc.id)}">${esc(acc.icon || '👤')} ${esc(acc.name)}</button>`).join('');
    container.querySelectorAll('.profile-select-pill').forEach(btn => {
      btn.addEventListener('click', e => {
        state.loginTargetId = e.currentTarget.getAttribute('data-id');
        const acc = state.accounts.find(a => a.id === state.loginTargetId);
        const emailInput = document.getElementById('loginEmail');
        if (emailInput && acc) emailInput.value = acc.email;
        container.querySelectorAll('.profile-select-pill').forEach(b => b.classList.toggle('active', b === e.currentTarget));
        setLoginError('');
        document.getElementById('loginPassword')?.focus();
      });
    });
  }

  // --------------------------------------------------------------------------
  // Authentication, Password-Protected Logout & Multi-Account Management
  // --------------------------------------------------------------------------
  function setLoginError(msg) {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('hidden', !msg);
  }

  function openCreateAccountModal(forceRequired = false) {
    const errEl = document.getElementById('addAccountError');
    if (errEl) errEl.classList.add('hidden');
    const mustCreate = forceRequired || state.accounts.length === 0;
    document.getElementById('addAccountBackBtn')?.classList.toggle('hidden', mustCreate);
    document.getElementById('closeAddAccountModalBtn')?.classList.toggle('hidden', mustCreate);
    closeModal('loginModal');
    closeModal('logoutConfirmModal');
    openModal('addAccountModal');
    setTimeout(() => document.getElementById('newAccountName')?.focus(), 50);
  }

  function openLoginModal(targetId) {
    if (state.accounts.length === 0) {
      openCreateAccountModal(true);
      return;
    }
    state.loginTargetId = targetId || state.currentId || state.accounts[0]?.id;
    const acc = state.accounts.find(a => a.id === state.loginTargetId);
    const email = document.getElementById('loginEmail');
    const pw = document.getElementById('loginPassword');
    if (email && acc) email.value = acc.email;
    if (pw) pw.value = '';
    setLoginError('');
    renderLoginAccountPills();
    openModal('loginModal');
    setTimeout(() => pw && pw.focus(), 50);
  }

  // Device Session Security: Ask current account password to log out, then switch to another account or create a new account
  function openLogoutConfirmModal() {
    if (!state.isLoggedIn) {
      if (state.accounts.length === 0) openCreateAccountModal(true);
      else openLoginModal();
      return;
    }
    const currentAcc = acct();
    if (!currentAcc) return;

    const descEl = document.getElementById('logoutModalAccountDesc');
    const pwInput = document.getElementById('logoutPasswordInput');
    const errEl = document.getElementById('logoutErrorMsg');
    const targetGroup = document.getElementById('logoutSwitchTargetGroup');
    const selectEl = document.getElementById('logoutNextAccountSelect');

    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    if (pwInput) pwInput.value = '';

    const otherAccounts = state.accounts.filter(a => a.id !== currentAcc.id);
    if (descEl) {
      if (otherAccounts.length > 0) {
        descEl.innerHTML = `Enter the password for <strong>${esc(currentAcc.name)}</strong> (${esc(currentAcc.email)}) to log out and switch to another account or create a new account.`;
      } else {
        descEl.innerHTML = `Enter the password for <strong>${esc(currentAcc.name)}</strong> (${esc(currentAcc.email)}) to log out. Since no other account is on this device, you will be directed to create a new account.`;
      }
    }

    if (targetGroup && selectEl) {
      if (otherAccounts.length > 0) {
        targetGroup.classList.remove('hidden');
        selectEl.innerHTML = otherAccounts.map(a =>
          `<option value="${esc(a.id)}">${esc(a.icon || '👤')} Switch to ${esc(a.name)} (${esc(a.email)})</option>`
        ).join('') + `<option value="__create_new__">➕ Create a New Account</option>`;
      } else {
        targetGroup.classList.add('hidden');
        selectEl.innerHTML = `<option value="__create_new__">➕ Create a New Account</option>`;
      }
    }

    openModal('logoutConfirmModal');
    setTimeout(() => pwInput?.focus(), 60);
  }

  async function handleConfirmLogoutSubmit() {
    const currentAcc = acct();
    if (!state.isLoggedIn || !currentAcc) return;

    const pwInput = document.getElementById('logoutPasswordInput');
    const errEl = document.getElementById('logoutErrorMsg');
    const selectEl = document.getElementById('logoutNextAccountSelect');
    const setErr = msg => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.classList.toggle('hidden', !msg);
    };

    const pw = pwInput?.value || '';
    if (!pw) {
      setErr('Please enter your current account password to log out.');
      return;
    }

    const ok = await verifyPassword(currentAcc, pw);
    if (!ok) {
      playAudioChime('alert');
      setErr('Incorrect password for ' + currentAcc.name + '. Cannot log out.');
      if (pwInput) pwInput.value = '';
      return;
    }

    // Password verified — log out of current account
    saveData();
    const otherAccounts = state.accounts.filter(a => a.id !== currentAcc.id);
    const chosenTarget = selectEl ? selectEl.value : '';

    state.isLoggedIn = false;
    state.data = defaultData(0);
    state.chatMessages = [];
    state.edithCtx = null;
    saveSession(true);
    closeModal('logoutConfirmModal');
    renderAll();
    playAudioChime('alert');

    // If no other account exists on this device OR user chose to create a new account, direct to Create Account
    if (otherAccounts.length === 0 || chosenTarget === '__create_new__') {
      showToast(`Logged out of ${currentAcc.name}. Create a new account to continue.`);
      openCreateAccountModal(false);
    } else {
      const targetAcc = otherAccounts.find(a => a.id === chosenTarget) || otherAccounts[0];
      showToast(`Logged out of ${currentAcc.name}. Sign in to ${targetAcc.name}.`);
      openLoginModal(targetAcc.id);
    }
  }

  async function handleLoginSubmit() {
    const emailInput = document.getElementById('loginEmail');
    const pwInput = document.getElementById('loginPassword');
    const email = (emailInput?.value || '').trim().toLowerCase();
    const pw = pwInput?.value || '';
    const acc = state.accounts.find(a => a.email.toLowerCase() === email) || state.accounts.find(a => a.id === state.loginTargetId);

    if (!acc) { setLoginError('No account found with that email.'); return; }
    if (!pw) { setLoginError('Please enter your password.'); return; }

    const att = state.attempts[acc.id] || { count: 0, until: 0 };
    if (att.until > Date.now()) {
      setLoginError(`Too many attempts. Try again in ${Math.ceil((att.until - Date.now()) / 1000)}s.`);
      return;
    }
    const ok = await verifyPassword(acc, pw);
    if (!ok) {
      att.count += 1;
      if (att.count >= MAX_ATTEMPTS) { att.until = Date.now() + LOCK_MS; att.count = 0; }
      state.attempts[acc.id] = att;
      playAudioChime('alert');
      setLoginError(att.until > Date.now() ? `Too many attempts. Locked for ${LOCK_MS / 1000}s.` : `Wrong password. ${MAX_ATTEMPTS - att.count} attempt(s) left.`);
      if (pwInput) pwInput.value = '';
      return;
    }
    state.attempts[acc.id] = { count: 0, until: 0 };
    loginAs(acc.id);
  }

  function loginAs(id) {
    const acc = state.accounts.find(a => a.id === id);
    if (!acc) return;
    if (state.isLoggedIn) saveData();
    state.currentId = id;
    state.data = loadAccountData(acc);
    state.isLoggedIn = true;
    state.edithCtx = null;
    resetChat();
    saveSession(false);
    closeModal('loginModal');
    closeModal('addAccountModal');
    closeModal('logoutConfirmModal');
    const pw = document.getElementById('loginPassword');
    if (pw) pw.value = '';
    renderAll();
    playAudioChime('success');
    showToast(`Signed in as ${acc.name}`);
    window.dispatchEvent(new Event('focus'));
  }

  async function handleCreateAccount() {
    const val = id => (document.getElementById(id)?.value || '').trim();
    const err = msg => { const el = document.getElementById('addAccountError'); if (el) { el.textContent = msg; el.classList.toggle('hidden', !msg); } };
    const name = val('newAccountName');
    const email = val('newAccountEmail').toLowerCase();
    const role = val('newAccountRole') || 'Student';
    const pw = document.getElementById('newAccountPassword')?.value || '';
    const pw2 = document.getElementById('newAccountPassword2')?.value || '';
    const allowance = parseFloat(val('newAccountAllowance') || '0');
    const balRaw = val('newAccountBalance');
    const balance = balRaw === '' ? allowance : parseFloat(balRaw);

    if (name.length < 2) return err('Enter an account name (min 2 characters).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('Enter a valid email address.');
    if (state.accounts.some(a => a.email.toLowerCase() === email)) return err('An account with this email already exists.');
    if (pw.length < 6) return err('Password must be at least 6 characters.');
    if (pw !== pw2) return err('Passwords do not match.');
    if (!isFinite(allowance) || allowance < 0) return err('Enter a valid monthly allowance.');
    if (!isFinite(balance) || balance < 0) return err('Enter a valid starting balance.');

    const salt = makeSalt();
    const acc = {
      id: 'usr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name, email, role,
      icon: ROLE_ICONS[role] || '👤',
      allowance, savingsTarget: Math.round(allowance * 0.2),
      salt, passHash: await hashPassword(pw, salt),
      createdAt: new Date().toISOString().slice(0, 10)
    };
    state.accounts.push(acc);
    lsSet(dataKey(acc.id), defaultData(balance));
    saveAccounts();
    err('');
    ['newAccountName', 'newAccountEmail', 'newAccountPassword', 'newAccountPassword2', 'newAccountAllowance', 'newAccountBalance'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    closeModal('addAccountModal');
    closeModal('loginModal');
    loginAs(acc.id);
    showToast(`Welcome ${name}! Account created and signed in automatically.`);
  }

  async function deleteAccount(id) {
    const acc = state.accounts.find(a => a.id === id);
    if (!acc || id === state.currentId) return;
    if (state.accounts.length <= 1) { showToast('At least one account must remain.'); return; }
    if (!confirm(`Permanently delete "${acc.name}" and ALL its data?`)) return;
    const pw = prompt(`Enter the password for ${acc.name} to confirm:`);
    if (pw === null) return;
    if (!(await verifyPassword(acc, pw))) { showToast('Wrong password. Account not deleted.'); return; }
    state.accounts = state.accounts.filter(a => a.id !== id);
    lsRemove(dataKey(id));
    saveAccounts();
    renderAll();
    showToast('Account deleted.');
  }

  // --------------------------------------------------------------------------
  // Ledger mutations (Add, Edit via ⋮ menu, Delete via ⋮ menu)
  // --------------------------------------------------------------------------
  function addTransactionToLedger(tx) {
    tx.ts = tx.ts || Date.now();
    D().transactions.unshift(tx);
    D().manualBalance = tx.type === 'debit'
      ? Math.max(0, (Number(D().manualBalance) || 0) - tx.amount)
      : (Number(D().manualBalance) || 0) + tx.amount;
    saveData();
    renderAll();
  }

  function updateTransactionInLedger(id, newProps) {
    const idx = D().transactions.findIndex(t => t.id === id);
    if (idx === -1) return false;
    const oldTx = D().transactions[idx];

    let bal = Number(D().manualBalance) || 0;
    bal = oldTx.type === 'debit' ? bal + oldTx.amount : bal - oldTx.amount;

    const updatedTx = {
      ...oldTx,
      amount: newProps.amount,
      merchant: newProps.merchant,
      category: newProps.type === 'credit' ? 'Allowance' : newProps.category,
      type: newProps.type
    };
    bal = updatedTx.type === 'debit' ? Math.max(0, bal - updatedTx.amount) : Math.max(0, bal + updatedTx.amount);

    D().transactions[idx] = updatedTx;
    D().manualBalance = bal;
    saveData();
    renderAll();
    return true;
  }

  function deleteTransaction(id) {
    const tx = D().transactions.find(t => t.id === id);
    if (tx) {
      const bal = Number(D().manualBalance) || 0;
      D().manualBalance = tx.type === 'debit' ? bal + tx.amount : Math.max(0, bal - tx.amount);
    }
    D().transactions = D().transactions.filter(t => t.id !== id);
    saveData();
    renderAll();
    showToast('Transaction deleted');
  }

  function openContributeGoalModal(goalId) {
    if (!state.isLoggedIn) {
      openLoginModal();
      return;
    }
    const goal = D().goals.find(g => g.id === goalId);
    if (!goal) return;

    state.activeGoalId = goal.id;
    const remaining = Math.max(0, goal.target - goal.saved);
    const pct = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;

    setText('contribGoalTitleBadge', `${goal.icon || '🎯'} ${goal.title}`);
    setText('contribGoalRemainingBadge', remaining > 0 ? `${fmt(remaining)} to go` : 'Goal Completed! 🎉');
    setText('contribGoalProgressText', `Saved ${fmt(goal.saved)} of ${fmt(goal.target)} (${pct}%) • Current Balance: ${fmt(computeBalance(D()))}`);

    const amtInput = document.getElementById('contribGoalAmount');
    const methodSelect = document.getElementById('contribGoalMethod');
    const noteInput = document.getElementById('contribGoalNote');
    const errEl = document.getElementById('contribGoalError');

    if (amtInput) amtInput.value = '';
    if (methodSelect) methodSelect.value = 'balance_ledger';
    if (noteInput) noteInput.value = '';
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

    openModal('contributeGoalModal');
    setTimeout(() => amtInput?.focus(), 60);
  }

  function handleConfirmContributeGoal() {
    const goal = D().goals.find(g => g.id === state.activeGoalId);
    if (!goal) {
      closeModal('contributeGoalModal');
      return;
    }

    const amtInput = document.getElementById('contribGoalAmount');
    const methodSelect = document.getElementById('contribGoalMethod');
    const noteInput = document.getElementById('contribGoalNote');
    const errEl = document.getElementById('contribGoalError');
    const setErr = msg => {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.classList.toggle('hidden', !msg);
    };

    const amount = parseFloat(amtInput?.value || '');
    const method = methodSelect?.value || 'balance_ledger';
    const note = (noteInput?.value || '').trim();

    if (!isFinite(amount) || amount <= 0) {
      setErr('Please enter a valid amount to add (greater than ₹0).');
      return;
    }

    const currentBalance = computeBalance(D());
    if ((method === 'balance_ledger' || method === 'balance_only') && amount > currentBalance) {
      setErr(`Amount (${fmt(amount)}) exceeds your Current Balance (${fmt(currentBalance)}). Choose "Add Directly to Goal" or enter a smaller amount.`);
      return;
    }

    const before = goal.saved;
    goal.saved = Math.round((Number(goal.saved) || 0) + amount);

    if (method === 'balance_ledger') {
      const label = note ? `Goal: ${goal.title} (${note})` : `Savings Goal: ${goal.title}`;
      addTransactionToLedger({
        id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        amount,
        category: 'Savings Goal',
        merchant: label,
        type: 'debit',
        isAi: false
      });
    } else if (method === 'balance_only') {
      D().manualBalance = Math.max(0, currentBalance - amount);
      saveData();
      renderAll();
    } else {
      saveData();
      renderAll();
    }

    state.activeGoalId = null;
    closeModal('contributeGoalModal');
    playAudioChime('success');

    const methodDesc = method === 'direct'
      ? 'added directly to goal'
      : 'transferred from Current Balance';
    showToast(`🎯 Added ${fmt(amount)} to ${goal.title} (${methodDesc})`);

    if (before < goal.target && goal.saved >= goal.target) {
      launchConfetti();
      showToast(`🎉 Goal Complete: ${goal.title}!`);
    }
  }

  function deleteGoal(id) {
    D().goals = D().goals.filter(g => g.id !== id);
    saveData();
    renderSlide3();
    showToast('Savings goal removed');
  }

  function deleteReminder(id) {
    D().reminders = D().reminders.filter(r => r.id !== id);
    saveData();
    renderSlide3();
    showToast('Reminder removed');
  }

  // --------------------------------------------------------------------------
  // Strict Android Notification & SMS Source Verification + Parsing
  // --------------------------------------------------------------------------
  function verifyNotificationSource(pkg, title, text) {
    const lowerPkg = (pkg || '').toLowerCase().trim();
    const combined = `${title || ''} ${text || ''}`;

    // Never allow social / chat / email / entertainment apps to auto-log
    if (BLOCKED_APP_PACKAGES.has(lowerPkg)) {
      return { allowed: false, appLabel: title || pkg };
    }
    if (PROMO_OR_OTP_RX.test(combined)) {
      return { allowed: false, appLabel: title || pkg };
    }

    // 1. Direct allowed UPI / Payment apps: PhonePe, Google Pay, Paytm, FamPay/FanPay, BHIM UPI
    if (ALLOWED_PAYMENT_APP_PACKAGES[lowerPkg]) {
      return { allowed: true, appLabel: ALLOWED_PAYMENT_APP_PACKAGES[lowerPkg] };
    }
    if (/phonepe|phonepay/i.test(lowerPkg)) return { allowed: true, appLabel: 'PhonePe' };
    if (/paisa|googlepay|gpay/i.test(lowerPkg)) return { allowed: true, appLabel: 'Google Pay' };
    if (/paytm/i.test(lowerPkg)) return { allowed: true, appLabel: 'Paytm' };
    if (/fampay|fanpay/i.test(lowerPkg)) return { allowed: true, appLabel: 'FamPay' };
    if (/rupay/i.test(lowerPkg)) return { allowed: true, appLabel: 'RuPay' };
    if (/npci|bhim|upi/i.test(lowerPkg)) return { allowed: true, appLabel: 'UPI Alert' };

    // 2. SMS notifications: read all SMS, allow ONLY if it contains a Bank name or PhonePe/GPay/Paytm/RuPay/FamPay/UPI
    const isSmsApp = SMS_APP_PACKAGES.has(lowerPkg) ||
      lowerPkg.includes('.mms') ||
      lowerPkg.includes('.messaging') ||
      lowerPkg.includes('sms');

    if (isSmsApp) {
      if (BANK_NAMES_RX.test(combined) || ALLOWED_PAYMENT_BRANDS_RX.test(combined)) {
        const bankMatch = combined.match(BANK_NAMES_RX);
        const brandMatch = combined.match(ALLOWED_PAYMENT_BRANDS_RX);
        const tag = bankMatch ? bankMatch[0].toUpperCase() + ' SMS' : (brandMatch ? cap(brandMatch[0]) + ' SMS' : 'Bank SMS');
        return { allowed: true, appLabel: tag };
      }
      return { allowed: false, appLabel: 'SMS' };
    }

    // 3. Notification from a Bank app or UPI notification containing both payment/UPI brand or bank name
    if (ALLOWED_PAYMENT_BRANDS_RX.test(combined) || BANK_NAMES_RX.test(combined)) {
      // Ensure it's not a random third-party non-financial app
      if (!lowerPkg || lowerPkg.includes('bank') || lowerPkg.includes('fin') || ALLOWED_PAYMENT_BRANDS_RX.test(title || '') || BANK_NAMES_RX.test(title || '')) {
        const label = title || 'UPI / Bank Alert';
        return { allowed: true, appLabel: label };
      }
    }

    return { allowed: false, appLabel: title || pkg || 'Other App' };
  }

  function classifySmsText(text) {
    const lower = text.toLowerCase();
    const m = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)
      || text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|rupees|₹)/i)
      || text.match(/(?:debited|credited|spent|paid|sent|received|receive)\s+(?:by|for|of|rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const parsed = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
    const amount = isFinite(parsed) && parsed > 0 ? parsed : null;

    // 1. Check if money was sent/paid/transferred TO YOU or received by you
    const sentToYouMatch = /\b(?:sent|paid|transferred)\s+(?:[^.!?\n]{0,40}?\s+)?to\s+you\b|\b(?:sent|paid|transferred)\s+you\b/i.exec(lower);
    const receiveWordMatch = /\b(credited|credit|received|receive|receiving|deposited|refund|cashback|salary|allowance)\b/i.exec(lower);

    // 2. For debit keywords, ignore "sent"/"paid" when part of "sent/paid ... to you"
    const cleanedForDebit = lower
      .replace(/\b(?:sent|paid|transferred)\s+(?:[^.!?\n]{0,40}?\s+)?to\s+you\b/gi, ' ')
      .replace(/\b(?:sent|paid|transferred)\s+you\b/gi, ' ');
    const debitMatch = /\b(debited|debit|spent|paid|sent|withdrawn|deducted)\b/i.exec(cleanedForDebit);

    let creditMatch = receiveWordMatch;
    if (sentToYouMatch && (!creditMatch || sentToYouMatch.index < creditMatch.index)) {
      creditMatch = sentToYouMatch;
    }

    // Must have at least one transaction action word (debit or credit) to be a real transaction
    if (!debitMatch && !creditMatch) {
      return { amount: null, merchant: null, category: null, type: 'debit', known: false, rawMerchantHint: '' };
    }

    let type = 'debit';
    if (debitMatch && creditMatch) {
      type = debitMatch.index <= creditMatch.index ? 'debit' : 'credit';
    } else if (creditMatch) {
      type = 'credit';
    }

    if (type === 'credit') {
      const category = 'Allowance';
      let merchant = 'Allowance Received';
      const fromSender = text.match(/\bfrom\s+([A-Za-z][A-Za-z0-9 &.'-]{1,35}?)(?=\s+(?:via|on|ref|upi|using|a\/c)\b|[.,\n]|$)/i)
        || text.match(/^([A-Za-z][A-Za-z0-9 &.'-]{1,35}?)\s*(?:—|-|:|\n)+\s*(?:has\s+)?(?:sent|paid|transferred)\b/i)
        || text.match(/([A-Za-z][A-Za-z0-9 &.'-]{1,35}?)\s+(?:has\s+)?(?:sent|paid|transferred)\s+(?:rs\.?|inr|₹)?\s*[\d,]+/i);
      const rawSender = fromSender ? fromSender[1].trim() : '';
      if (/dad|mom|parent|allowance|family/i.test(lower)) {
        merchant = 'Family Allowance UPI';
      } else if (rawSender && !/^(you|your|me|rs|inr)$/i.test(rawSender)) {
        merchant = /allowance|upi/i.test(rawSender) ? rawSender : `${rawSender} (Allowance)`;
      } else if (/phonepe|phonepay/i.test(lower)) {
        merchant = 'PhonePe (Allowance)';
      } else if (/google\s*pay|gpay|googlepay/i.test(lower)) {
        merchant = 'Google Pay (Allowance)';
      } else if (/paytm/i.test(lower)) {
        merchant = 'Paytm (Allowance)';
      } else if (/fampay|fanpay/i.test(lower)) {
        merchant = 'FamPay (Allowance)';
      }
      return { amount, merchant, category, type, known: true, rawMerchantHint: merchant };
    }

    // Extract raw payee / merchant candidate from SMS if present (e.g. "credited to VELAGA DVSTARAKESH via UPI")
    const g = text.match(/(?:credited\s+to|paid\s+to|sent\s+to|trf\s+to|\bat|\bto)\s+([A-Za-z][A-Za-z0-9 &.'-]{1,35}?)(?=\s+(?:via|on|ref|upi|using|a\/c)\b|[.,\n]|$)/i);
    const rawCandidate = g ? g[1].trim() : '';
    const cleanCandidate = rawCandidate && !/^(you|your|me|a\/c|account|bank|upi)$/i.test(rawCandidate) ? rawCandidate : '';

    let merchant = null, category = null, known = false;

    // 1. Check user-taught / remembered aliases in account database
    const aliases = (D() && D().edith && D().edith.aliases) || {};
    for (const [w, val] of Object.entries(aliases)) {
      if (new RegExp('\\b' + escRx(w.toLowerCase()) + '\\b', 'i').test(lower)) {
        if (typeof val === 'object' && val !== null) {
          category = val.category || 'Shopping';
          merchant = val.item ? `${val.merchant || cap(w)} (${val.item})` : (val.merchant || cap(w));
        } else {
          category = String(val);
          merchant = cleanCandidate || cap(w);
        }
        known = true;
        break;
      }
    }

    // 2. Check built-in KNOWN_MERCHANTS
    if (!known) {
      for (const km of KNOWN_MERCHANTS) {
        if (new RegExp('\\b(?:' + km.k + ')\\b', 'i').test(lower)) {
          merchant = km.n;
          category = km.c;
          known = true;
          break;
        }
      }
    }

    // 3. Check if BOTH a merchant name and an explicit category keyword are present in the text
    if (!known) {
      const explicitCat = findCategory(lower, false);
      if (cleanCandidate && explicitCat) {
        merchant = cleanCandidate;
        category = explicitCat;
        known = true;
      }
    }

    // If not known, do NOT guess or auto-log — return known: false so the listener sends a clipboard notification to the user
    return {
      amount,
      merchant: known ? merchant : null,
      category: known ? category : null,
      type,
      known,
      rawMerchantHint: cleanCandidate
    };
  }

  function handleIncomingNotification(app, text, amount, merchant, category, type) {
    if (!state.isLoggedIn) { showToast('Sign in first to record transactions.'); openLoginModal(); return; }
    if (!amount) return;

    const isCredit = type === 'credit';
    const finalCategory = isCredit ? 'Allowance' : category;
    const finalMerchant = merchant || (isCredit ? 'Allowance Received' : 'Merchant');

    const banner = document.getElementById('headsUpBanner');
    if (banner) {
      setText('bannerApp', app);
      setText('bannerText', text);
      banner.classList.remove('hidden');
      clearTimeout(handleIncomingNotification._t);
      handleIncomingNotification._t = setTimeout(() => banner.classList.add('hidden'), 5000);
    }
    playAudioChime('success');

    D().notifications.unshift({ app, text, amount, type: isCredit ? 'credit' : 'debit', status: 'logged', ts: Date.now() });
    D().notifications = D().notifications.slice(0, 30);
    D().unread = (D().unread || 0) + 1;

    addTransactionToLedger({
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount,
      category: finalCategory,
      merchant: finalMerchant,
      type: isCredit ? 'credit' : 'debit',
      isAi: true
    });
    showToast(
      isCredit
        ? `💰 Allowance +${fmt(amount)} added to balance (${finalMerchant})`
        : `💸 Auto-logged -${fmt(amount)} (${finalMerchant} • ${finalCategory})`
    );
  }

  // When merchant name or category is UNKNOWN: do NOT auto-log!
  // Copy details to clipboard, notify the user, and open the Categorize Clipboard Transaction modal.
  function handleUnknownTransactionToClipboard(app, text, amount, rawMerchantHint) {
    if (!state.isLoggedIn) return;

    const pendingId = `pend-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const clipSummary = `Campus Ledger Action Needed: ${fmt(amount)} via ${app} | ${rawMerchantHint ? 'Payee: ' + rawMerchantHint + ' | ' : ''}${text}`;

    // 1. Copy to user's clipboard
    copyTextToUserClipboard(clipSummary);

    // 2. Send native Android notification & Heads-up banner
    const notifTitle = `📋 Categorize ${fmt(amount)} Transaction (${app})`;
    const notifBody = `Copied to clipboard! Tap to choose Category, Merchant Name & Item Purchased.`;
    sendNativeUserNotification(notifTitle, notifBody);

    const banner = document.getElementById('headsUpBanner');
    if (banner) {
      setText('bannerApp', `${app} • Copied to Clipboard`);
      setText('bannerText', `Tap to choose category, merchant & item for ${fmt(amount)}`);
      banner.classList.remove('hidden');
      banner.onclick = () => {
        banner.classList.add('hidden');
        openCategorizeModal(pendingId);
      };
      clearTimeout(handleIncomingNotification._t);
      handleIncomingNotification._t = setTimeout(() => banner.classList.add('hidden'), 7000);
    }
    playAudioChime('alert');

    // 3. Save to pendingTransactions and notifications
    const pendingItem = {
      id: pendingId,
      app,
      text,
      amount,
      rawMerchantHint: rawMerchantHint || '',
      ts: Date.now()
    };
    D().pendingTransactions.unshift(pendingItem);
    D().notifications.unshift({
      app: `${app} (Needs Category)`,
      text: `📋 Copied to clipboard: ${text}`,
      amount,
      type: 'pending',
      pendingId,
      ts: Date.now()
    });
    D().notifications = D().notifications.slice(0, 30);
    D().unread = (D().unread || 0) + 1;
    saveData();
    renderAll();

    // 4. Immediately open the Categorize Clipboard Transaction modal for the user
    openCategorizeModal(pendingId);
    showToast(`📋 ${fmt(amount)} copied to clipboard — choose Category, Merchant & Item!`);
  }

  function openCategorizeModal(pendingId) {
    const item = D().pendingTransactions.find(p => p.id === pendingId) || D().pendingTransactions[0];
    if (!item) return;

    state.activePendingTxId = item.id;
    setText('catModalAppBadge', item.app || 'Bank / UPI Alert');
    setText('catModalAmountDisplay', fmt(item.amount));
    setText('catModalRawText', item.text);

    const catEl = document.getElementById('catModalCategory');
    const merchEl = document.getElementById('catModalMerchant');
    const itemEl = document.getElementById('catModalItem');
    const remEl = document.getElementById('catModalRemember');
    const errEl = document.getElementById('catModalError');

    if (catEl) catEl.value = 'Food & Dining';
    if (merchEl) merchEl.value = item.rawMerchantHint || '';
    if (itemEl) itemEl.value = '';
    if (remEl) remEl.checked = true;
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

    closeModal('notifModal');
    openModal('categorizeTxModal');
    setTimeout(() => {
      if (merchEl && !merchEl.value) merchEl.focus();
      else itemEl?.focus();
    }, 60);
  }

  function handleConfirmCategorizeTransaction() {
    const item = D().pendingTransactions.find(p => p.id === state.activePendingTxId);
    if (!item) {
      closeModal('categorizeTxModal');
      return;
    }

    const category = document.getElementById('catModalCategory')?.value || 'Food & Dining';
    const merchantName = (document.getElementById('catModalMerchant')?.value || '').trim();
    const itemPurchased = (document.getElementById('catModalItem')?.value || '').trim();
    const remember = !!document.getElementById('catModalRemember')?.checked;
    const errEl = document.getElementById('catModalError');

    if (!merchantName) {
      if (errEl) { errEl.textContent = 'Please enter the merchant or shop name.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!itemPurchased) {
      if (errEl) { errEl.textContent = 'Please enter the item purchased.'; errEl.classList.remove('hidden'); }
      return;
    }

    const combinedMerchant = `${merchantName} — ${itemPurchased}`;

    // If "Remember this merchant" is checked, save into D().edith.aliases so future alerts from this merchant auto-log
    if (remember) {
      const keyToLearn = (item.rawMerchantHint || merchantName).toLowerCase().trim();
      if (keyToLearn.length >= 2) {
        D().edith.aliases[keyToLearn] = {
          category,
          merchant: merchantName,
          item: itemPurchased
        };
      }
    }

    // Remove from pendingTransactions
    D().pendingTransactions = D().pendingTransactions.filter(p => p.id !== item.id);

    // Log transaction into ledger & update balance
    addTransactionToLedger({
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: item.amount,
      category,
      merchant: combinedMerchant,
      type: 'debit',
      isAi: true
    });

    state.activePendingTxId = null;
    closeModal('categorizeTxModal');
    playAudioChime('success');
    showToast(`✅ Logged -${fmt(item.amount)} for ${combinedMerchant} (${category})`);
  }

  function renderNotifications() {
    const list = document.getElementById('notifListContainer');
    if (!list) return;
    const items = state.isLoggedIn ? D().notifications : [];
    list.innerHTML = items.length ? items.map(n => {
      const isPending = n.type === 'pending' && D().pendingTransactions.some(p => p.id === n.pendingId);
      return `
      <div class="notif-item">
        <div style="min-width:0;flex:1;">
          <strong>${esc(n.app)}</strong>
          <div class="text-mute" style="font-size:0.75rem;word-break:break-word;">${esc(n.text)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          ${n.amount > 0
            ? `<div class="${n.type === 'credit' ? 'text-emerald' : 'text-rose'}" style="font-weight:800;">${n.type === 'credit' ? '+' : '-'}${fmt(n.amount)}</div>`
            : `<span class="badge-amber">Alert</span>`}
          ${isPending ? `<button type="button" class="btn-amber notif-categorize-btn" data-id="${esc(n.pendingId)}" style="padding:5px 10px;font-size:0.72rem;">Categorize</button>` : ''}
        </div>
      </div>`;
    }).join('') : '<div class="text-mute" style="font-size:0.85rem;text-align:center;padding:16px;">No notifications captured yet.</div>';

    list.querySelectorAll('.notif-categorize-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        openCategorizeModal(e.currentTarget.getAttribute('data-id'));
      });
    });
  }

  // --------------------------------------------------------------------------
  // EDITH 2.5 + Gemini API Engine
  // --------------------------------------------------------------------------
  function findCategory(t, useAliases = true) {
    if (useAliases && D() && D().edith) {
      for (const [w, c] of Object.entries(D().edith.aliases)) {
        if (new RegExp('\\b' + escRx(w) + '\\b', 'i').test(t)) {
          return typeof c === 'object' && c !== null ? c.category : c;
        }
      }
    }
    const tokens = new Set(t.match(/[a-z]+/g) || []);
    let best = null, bestN = 0;
    for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
      const n = kws.filter(k => tokens.has(k)).length;
      if (n > bestN) { best = cat; bestN = n; }
    }
    return best;
  }

  function parseAmount(t) {
    const cleaned = t.replace(/\b(?:last|past|next)\s+\d+\s*(?:days?|weeks?|months?)\b/g, ' ').replace(/\b\d+\s*(?:days?|weeks?|months?)\b/g, ' ');
    const m = cleaned.match(/(?:₹|rs\.?|inr|\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:(k|thousand|lakh|lac)\b)?/i);
    if (!m) return null;
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) return null;
    const mult = (m[2] || '').toLowerCase();
    if (mult === 'k' || mult === 'thousand') n *= 1000;
    else if (mult === 'lakh' || mult === 'lac') n *= 100000;
    return n > 0 ? n : null;
  }

  function parsePeriod(t) {
    if (/\byesterday\b/.test(t)) return 'yesterday';
    if (/\b(today|tonight|this morning|this afternoon)\b/.test(t)) return 'today';
    if (/\b(this week|last 7 days|past 7 days|past week|last week|weekly)\b|\bweek\b/.test(t)) return 'week';
    if (/\b(last month|previous month)\b/.test(t)) return 'lastmonth';
    if (/\b(month|monthly)\b/.test(t)) return 'month';
    return null;
  }

  function findItem(t) {
    const tokens = t.match(/[a-z]+/g) || [];
    const known = tokens.find(w => ITEM_PRICES[w] != null);
    if (known) return known;
    const m = t.match(/\b(?:buy|get|order|purchase|afford|spend on|have|take|eat)\s+(?:a|an|the|some|new|my|any)?\s*([a-z][a-z' -]{1,28}?)(?=\s+(?:tonight|today|now|this|for|worth|please|tomorrow|at|from|\d)|$|[?.!,])/);
    if (m) {
      const w = m[1].trim();
      if (!/^(it|that|this|them|something|anything|one)$/.test(w)) return w;
    }
    return null;
  }

  function extractEntities(t) {
    return { amount: parseAmount(t), period: parsePeriod(t), cat: findCategory(t), item: findItem(t) };
  }

  const RX = {
    greet: /^(hi|hello|hey|hii+|namaste|yo|good (morning|afternoon|evening))\b/,
    teach: /^(teach|learn|remember)\b/,
    learned: /what (have you|did you) (learn|learnt)|your memory|what do you know about me/,
    appInfo: /\b(how to use|how does (this|the) app|about (this|the) app|what is campus ledger|three dots|edit transaction|delete transaction|notification listener|sms interceptor|clipboard|logout|log out|switch account|settings tab|analytics tab)\b/,
    help: /\b(help|what can you (do|answer)|how do you work|commands|features)\b/,
    afford: /\b(can|could|should|shall|may|will) (i|we)\b.*\b(buy|afford|get|order|purchase|spend|eat|go|have|take)\b|\bafford\b|\bworth (it|buying)\b|\bis it (ok|okay|fine|safe) to\b/,
    forecast: /\b(forecast|predict|projection|project)\b|end of (the )?month|run out|last (till|until|me)|will .*last|enough money|month end/,
    rule: /50.?30.?20|\bneeds\b.*\bwants\b/,
    balance: /\bbalance\b|how much (money )?(do i have|is left|left|remains?)|money left|\bremaining\b|\bbacha\b|\bbaki\b/,
    daily: /\b(daily|per day|each day|a day|safe (limit|rate)|today'?s? (limit|budget))\b/,
    biggest: /\b(biggest|largest|highest|top|most expensive|maximum)\b/,
    recent: /\b(recent|latest|history)\b|last (few |\d+ )?(transactions?|payments?|expenses?)/,
    income: /\b(income|received|credited|earned|pocket money)\b|how much (did i get|allowance)/,
    goals: /\b(goals?|target|saved|savings goal)\b/,
    reminders: /\b(reminders?|due|upcoming|deadline|fees?)\b|bills? due/,
    budget: /\b(budgets?|limits?|over ?budget|exceed|overspend|overspent|cap)\b/,
    account: /\b(accounts?|profile|who am i|logged in|which user)\b/,
    summary: /\b(summary|overview|report|status|how am i doing|insights?|analysis|analy[sz]e)\b/,
    tips: /\b(save|saving|savings|tips?|advice|suggest|suggestions|reduce|cut down|cut back|economi[sz]e|frugal|invest|investment|mutual fund|sip|emergency fund)\b/,
    spend: /\b(spent|spend|spending|expenses?|expenditure|kharch|kharcha|cost me|paid)\b|how much|\bkitna\b/,
    thanks: /\b(thanks|thank you|thx|great|awesome|nice|cool)\b/
  };

  function detectIntent(t, ent) {
    if (RX.greet.test(t)) return 'greet';
    if (RX.teach.test(t)) return 'teach';
    if (RX.learned.test(t)) return 'learned';
    if (/^(i |just |i've |ive )?(spent|paid|bought|add|log|record|had|got|received)\b/.test(t) && ent.amount) return 'addTx';
    if (RX.appInfo.test(t)) return 'appInfo';
    if (RX.help.test(t)) return 'help';
    if (RX.afford.test(t)) return 'afford';
    if (RX.forecast.test(t)) return 'forecast';
    if (RX.rule.test(t)) return 'rule';
    if (RX.balance.test(t) && !/\bspent\b/.test(t)) return 'balance';
    if (RX.daily.test(t)) return 'daily';
    if (RX.biggest.test(t)) return 'biggest';
    if (RX.recent.test(t)) return 'recent';
    if (RX.goals.test(t)) return 'goals';
    if (RX.reminders.test(t)) return 'reminders';
    if (RX.budget.test(t)) return 'budget';
    if (RX.income.test(t)) return 'income';
    if (RX.account.test(t)) return 'account';
    if (RX.summary.test(t)) return 'summary';
    if (RX.tips.test(t)) return 'tips';
    if (RX.spend.test(t) || ent.cat) return 'spend';
    if (RX.thanks.test(t) && t.split(' ').length <= 5) return 'thanks';
    if (ent.item && ITEM_PRICES[ent.item] != null) return 'afford';
    return null;
  }

  function splitQuestions(q) {
    const parts = q.split(/[?;\n]+|\s+(?:and then|then|also|plus)\s+|\s+and\s+(?=(?:how|what|can|should|show|tell|am i|do i|is |when|which|why|list|will|where|spend|spent|spending|balance|budget|goals?|my |forecast|summary|saving|savings|dues|reminders?|income|biggest|recent|daily|safe))/i)
      .map(s => s && s.trim()).filter(s => s && s.length > 1);
    return parts.length ? parts : [q.trim()];
  }

  const verdict = (kind, title, inner) => `<div class="verdict-card ${kind}"><strong>${title}</strong><div style="margin-top:4px;">${inner}</div></div>`;
  const ul = rows => '<ul style="padding-left:18px;line-height:1.6;">' + rows.map(r => `<li>${r}</li>`).join('') + '</ul>';

  function topGroups(txs, keyFn, n = 3) {
    const m = {};
    txs.forEach(t => { const k = keyFn(t); m[k] = (m[k] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);
  }

  function runIntent(intent, ent, t) {
    const fin = calculateFinancials();
    const first = (acct()?.name || 'there').split(' ')[0];
    const label = PERIOD_LABEL[ent.period || 'month'];

    switch (intent) {
      case 'greet':
        return { reply: `Hi ${first}! Your balance is ${fmt(fin.balance)} with a safe limit of ${fmt(fin.safeDailyLimit)}/day. You can speak to me with your voice or ask me anything about the app or your finances!`, card: null };

      case 'thanks':
        return { reply: 'Happy to help! Ask me anything else about Campus Ledger or your money.', card: null };

      case 'appInfo': {
        const card = verdict('safe', '🏛️ Campus Ledger App Guide', ul([
          '<strong>Ledger Tab:</strong> View your Current Balance, Monthly Allowance, Spent this Month, and Dynamic Safe Daily Limit. Tap <strong>⋮</strong> on any transaction to <strong>✏️ Edit</strong> or <strong>🗑️ Delete</strong> it.',
          '<strong>Smart SMS &amp; UPI Listener (in Settings):</strong> Reads all SMS &amp; notifications, auto-logging only from <strong>PhonePe, Google Pay, Paytm, RuPay, FamPay, UPI</strong>, and <strong>Bank SMS</strong>.',
          '<strong>Unknown Merchant Clipboard Prompt:</strong> If an SMS/UPI alert has an unknown merchant or category, it copies it to your clipboard and opens a prompt to choose the <strong>Category, Merchant Name &amp; Item Purchased</strong>.',
          '<strong>Savings Goals (+ Add):</strong> Tap <strong>+ Add</strong> on any goal to choose how much to add and whether to transfer from your Current Balance or add directly.',
          '<strong>Settings &amp; Security:</strong> Configure your Balance, Notification Access, and use <strong>Password-Protected Log Out</strong> to switch or create accounts.'
        ]));
        return { reply: 'Here is how Campus Ledger works across all sections:', card };
      }

      case 'help': {
        const card = verdict('safe', '🤖 What EDITH Can Help With', ul([
          '<strong>Voice Conversation:</strong> Tap 🎙️ to speak directly with me and hear spoken replies.',
          '<strong>App Guidance:</strong> Ask how any feature works (SMS listener, clipboard categorization, ⋮ edit/delete menu, 50/30/20 rule, or account security).',
          '<strong>Affordability Check:</strong> “Can I buy ₹1,500 shoes?”',
          '<strong>Spending &amp; Budgets:</strong> “How much on food this week?” or “Budget status?”',
          '<strong>Financial Advice:</strong> Ask for personalised saving strategies, emergency fund tips, or student budget planning.',
          '<strong>Quick Logging:</strong> Say “I spent 150 on chai” or teach me “teach: maggi = food”.'
        ]));
        return { reply: 'I am trained to help you with both the Campus Ledger app and all your financial questions!', card };
      }

      case 'teach': {
        const m = t.match(/^(?:teach|learn|remember)\s*(?:that|:)?\s*(.+?)\s*(?:=|->|→|\bas\b|\bmeans\b|\bis\b)\s*(.+)$/);
        if (!m) return { reply: 'Teach me like this: *teach: maggi = food* (categories: food, transport, books, entertainment, shopping, bills, health).', card: null };
        const word = m[1].replace(/["']/g, '').trim().toLowerCase();
        const cat = findCategory(m[2], false);
        if (!word || word.length > 30 || /^\d+$/.test(word)) return { reply: 'Please give me a short word or merchant name to learn.', card: null };
        if (!cat) return { reply: `I couldn't map "${m[2]}" to a category. Try food, transport, books, entertainment, shopping, bills or health.`, card: null };
        D().edith.aliases[word] = cat;
        saveData();
        return { reply: `Learned! From now on "${word}" means **${cat}** — both in chat and in automatic SMS/UPI logging.`, card: verdict('safe', '🧠 EDITH learned something new', `<strong>${esc(word)}</strong> → ${esc(cat)}`) };
      }

      case 'learned': {
        const al = Object.entries(D().edith.aliases);
        const rows = al.map(([w, c]) => {
          const desc = typeof c === 'object' && c !== null ? `${c.merchant} (${c.item}) → ${c.category}` : String(c);
          return `<strong>${esc(w)}</strong> → ${esc(desc)}`;
        });
        const card = verdict('safe', '🧠 EDITH Memory', rows.length ? ul(rows) : 'No custom merchants saved yet.');
        return { reply: `I have ${al.length} remembered merchant/category mapping(s) in your database.`, card };
      }

      case 'addTx': {
        const credit = /\b(received|got|credited|income|allowance)\b/.test(t);
        const cat = credit ? 'Allowance' : (ent.cat || 'Shopping');
        const kw = (t.match(/\b(?:on|for|at|to|from)\s+(?:a|an|the|my)?\s*([a-z][a-z ]{1,20})/) || [])[1];
        const merchant = cap((kw || ent.item || cat).trim().replace(/\s+(today|yesterday|tonight)$/, ''));
        addTransactionToLedger({ id: `tx-${Date.now()}`, amount: ent.amount, category: cat, merchant, type: credit ? 'credit' : 'debit', isAi: true });
        const f2 = calculateFinancials();
        return {
          reply: `Recorded ${credit ? '+' : '-'}${fmt(ent.amount)} under **${cat}** (${merchant}). New balance: ${fmt(f2.balance)}.`,
          card: verdict(credit ? 'safe' : 'caution', '✅ Ledger updated', ul([`${esc(merchant)} — ${fmt(ent.amount)}`, `Balance now ${fmt(f2.balance)}; safe rate ${fmt(f2.safeDailyLimit)}/day`, 'Use the ⋮ menu on the transaction to edit or delete it.']))
        };
      }

      case 'afford': {
        let cost = ent.amount, est = false;
        const item = ent.item;
        if (!cost && item && ITEM_PRICES[item] != null) { cost = ITEM_PRICES[item]; est = true; }
        if (!cost) return { reply: 'How much does it cost? Try: *“Can I buy ₹1,500 shoes?”*', card: null };
        const dues = upcomingDues();
        const reserve = dues + 500;
        const after = fin.balance - cost;
        const newDaily = Math.max(0, Math.round(after / fin.daysRemaining));
        const cat = ent.cat || (item ? findCategory(item) : null);
        const rows = [
          `Price${est ? ' (typical estimate)' : ''}: <strong>${fmt(cost)}</strong>${item ? ' — ' + esc(item) : ''}`,
          `Balance ${fmt(fin.balance)} → <strong>${after < 0 ? 'short by ' + fmt(-after) : fmt(after)}</strong> after buying`,
          `Safe daily rate ${fmt(fin.safeDailyLimit)} → <strong>${fmt(newDaily)}</strong> for ${fin.daysRemaining} days`
        ];
        if (dues) rows.push(`Upcoming dues to keep aside: ${fmt(dues)}`);
        let catOver = false;
        if (cat && D().budgetLimits[cat]) {
          const left = D().budgetLimits[cat] - (spendByCategory('month')[cat] || 0);
          rows.push(`${esc(cat)} budget left: ${fmt(Math.max(0, left))}`);
          if (cost > left) catOver = true;
        }
        const goal = item && D().goals.find(g => g.title.toLowerCase().includes(item.split(' ')[0]));
        if (goal) rows.push(`Goal “${esc(goal.title)}”: ${fmt(goal.saved)} of ${fmt(goal.target)} saved already`);

        let kind, title, advice, reply;
        if (after < 0) {
          kind = 'danger'; title = '🔴 Not affordable';
          advice = 'You do not have enough balance. Add it to Savings Goals instead.';
          reply = `No — ${fmt(cost)} is more than your balance of ${fmt(fin.balance)}.`;
        } else if (after < reserve) {
          kind = 'danger'; title = '🔴 Not advised';
          advice = `It would leave ${fmt(after)}, below the ${fmt(reserve)} you need for dues and a safety buffer.`;
          reply = `I'd skip it. After buying you'd have ${fmt(after)}, less than the ${fmt(reserve)} buffer for upcoming dues.`;
        } else if (cost > fin.balance * 0.3 || newDaily < fin.safeDailyLimit * 0.5 || catOver) {
          kind = 'caution'; title = '🟡 Possible, but it hurts';
          advice = catOver ? 'It exceeds that category budget for the month.' : 'It takes a big bite out of your daily budget. Consider saving for it over a few weeks.';
          reply = `You can afford it, but it cuts your daily limit from ${fmt(fin.safeDailyLimit)} to ${fmt(newDaily)}${catOver ? ' and exceeds your category budget' : ''}.`;
        } else {
          kind = 'safe'; title = '🟢 Safe to buy';
          advice = 'It fits comfortably within your budget.';
          reply = `Yes! ${fmt(cost)} is comfortably affordable. Your daily limit would stay around ${fmt(newDaily)}.`;
        }
        return { reply, card: verdict(kind, title, ul(rows) + `<em>${advice}</em>`) };
      }

      case 'spend': {
        const key = ent.period || 'month';
        const txs = D().transactions.filter(x => x.type === 'debit' && inRange(x, key) && (!ent.cat || x.category === ent.cat));
        const total = sum(txs);
        if (!txs.length) return { reply: `No ${ent.cat ? ent.cat + ' ' : ''}spending recorded ${label}.`, card: null };
        const rows = [`Total: <strong>${fmt(total)}</strong> across ${txs.length} payment(s)`];
        topGroups(txs, x => x.merchant).forEach(([m, v]) => rows.push(`${esc(m)}: ${fmt(v)}`));
        if (!ent.cat) rows.push('Top categories: ' + topGroups(txs, x => x.category).map(([c, v]) => `${esc(c)} ${fmt(v)}`).join(', '));
        if (ent.cat && key === 'month' && D().budgetLimits[ent.cat]) {
          const lim = D().budgetLimits[ent.cat];
          rows.push(`Budget: ${fmt(total)} of ${fmt(lim)} (${Math.round((total / lim) * 100)}%)`);
        }
        return { reply: `You spent ${fmt(total)}${ent.cat ? ' on ' + ent.cat : ''} ${label} (${txs.length} payments).`, card: verdict('safe', `${CATEGORY_ICONS[ent.cat] || '📊'} ${esc(ent.cat || 'All')} spending ${label}`, ul(rows)) };
      }

      case 'balance': {
        const rows = [`Current Balance: <strong>${fmt(fin.balance)}</strong>`, `Safe daily limit: ${fmt(fin.safeDailyLimit)} for ${fin.daysRemaining} days`];
        const dues = upcomingDues();
        if (dues) rows.push(`Upcoming dues: ${fmt(dues)} → free after dues ${fmt(Math.max(0, fin.balance - dues))}`);
        return { reply: `Your balance is ${fmt(fin.balance)}; you can safely spend about ${fmt(fin.safeDailyLimit)}/day.`, card: verdict('safe', '💰 Balance snapshot', ul(rows)) };
      }

      case 'daily': {
        const today = sum(D().transactions.filter(x => x.type === 'debit' && inRange(x, 'today')));
        const left = fin.safeDailyLimit - today;
        return {
          reply: `Your safe limit is ${fmt(fin.safeDailyLimit)}/day. You've spent ${fmt(today)} today, so ${left >= 0 ? fmt(left) + ' is left' : 'you are over by ' + fmt(-left)}.`,
          card: verdict(left >= 0 ? 'safe' : 'caution', '📅 Daily limit', ul([`Safe limit: ${fmt(fin.safeDailyLimit)}`, `Spent today: ${fmt(today)}`, `${left >= 0 ? 'Left today' : 'Over by'}: ${fmt(Math.abs(left))}`]))
        };
      }

      case 'forecast': {
        const day = new Date().getDate();
        const spent = fin.totalExpenses;
        const avg = spent / Math.max(1, day);
        const projectedTotal = Math.round(avg * fin.totalDays);
        const endBalance = fin.balance - avg * fin.daysRemaining;
        const runOut = avg > 0 ? Math.floor(fin.balance / avg) : Infinity;
        const dues = upcomingDues();
        const kind = endBalance < 0 ? 'danger' : endBalance < dues ? 'caution' : 'safe';
        const rows = [`Average spend: ${fmt(avg)}/day so far`, `Projected month total: ${fmt(projectedTotal)}`, `Projected balance at month end: <strong>${fmt(Math.max(0, endBalance))}</strong>`];
        if (isFinite(runOut) && runOut < fin.daysRemaining) rows.push(`⚠️ Money could run out in ~${runOut} day(s)`);
        return {
          reply: endBalance < 0 ? `At this pace you'd run out in about ${runOut} days. Try to keep spending under ${fmt(fin.safeDailyLimit)}/day.` : `At your current pace you'd end the month with about ${fmt(endBalance)}.`,
          card: verdict(kind, '🔮 Month-end forecast', ul(rows))
        };
      }

      case 'biggest': {
        const key = ent.period || 'month';
        const txs = D().transactions.filter(x => x.type === 'debit' && inRange(x, key) && (!ent.cat || x.category === ent.cat)).sort((a, b) => b.amount - a.amount).slice(0, 3);
        if (!txs.length) return { reply: `No expenses found ${label}.`, card: null };
        return { reply: `Your biggest expense ${label} was ${fmt(txs[0].amount)} at ${txs[0].merchant}.`, card: verdict('safe', '🏆 Biggest expenses', ul(txs.map(x => `${esc(x.merchant)} — ${fmt(x.amount)} (${esc(x.category)})`))) };
      }

      case 'recent': {
        const txs = D().transactions.slice(0, 5);
        if (!txs.length) return { reply: 'No transactions yet.', card: null };
        return { reply: `Your last ${txs.length} transactions are below.`, card: verdict('safe', '🧾 Recent transactions', ul(txs.map(x => `${x.type === 'credit' ? '+' : '-'}${fmt(x.amount)} ${esc(x.merchant)} — ${esc(formatTxDate(x))}`))) };
      }

      case 'income': {
        const key = ent.period || 'month';
        const txs = D().transactions.filter(x => x.type === 'credit' && inRange(x, key));
        const total = sum(txs);
        if (!txs.length) return { reply: `No income recorded ${label}.`, card: null };
        return { reply: `You received ${fmt(total)} ${label}.`, card: verdict('safe', '💵 Income', ul(txs.map(x => `${esc(x.merchant)} — ${fmt(x.amount)}`))) };
      }

      case 'goals': {
        let goals = D().goals;
        if (ent.item) { const f = goals.filter(g => g.title.toLowerCase().includes(ent.item.split(' ')[0])); if (f.length) goals = f; }
        if (!goals.length) return { reply: 'You have no savings goals yet. Add one from the Goals section.', card: null };
        const rows = goals.map(g => {
          const left = Math.max(0, g.target - g.saved);
          const pct = g.target ? Math.round((g.saved / g.target) * 100) : 0;
          return `${esc(g.icon)} ${esc(g.title)}: ${pct}% — ${left ? fmt(left) + ' to go (~' + Math.ceil(left / 500) + ' weeks at ₹500/week)' : 'done 🎉'}`;
        });
        return { reply: `You have ${goals.length} goal(s); ${fmt(sum(goals.map(g => ({ amount: g.saved }))))} saved so far.`, card: verdict('safe', '🎯 Savings goals', ul(rows)) };
      }

      case 'reminders': {
        if (!D().reminders.length) return { reply: 'No reminders set.', card: null };
        const dues = upcomingDues();
        return {
          reply: `You have ${D().reminders.length} reminder(s) with ${fmt(dues)} due in total.`,
          card: verdict(dues > fin.balance ? 'danger' : 'safe', '⏰ Upcoming dues', ul(D().reminders.map(r => `${esc(r.title)} — ${r.amount > 0 ? fmt(r.amount) : 'notice'} (${esc(prettyDate(r.date))})`)))
        };
      }

      case 'budget': {
        const spent = spendByCategory('month');
        const rows = Object.entries(D().budgetLimits).map(([c, lim]) => ({ c, s: spent[c] || 0, lim, p: lim ? Math.round(((spent[c] || 0) / lim) * 100) : 0 })).sort((a, b) => b.p - a.p);
        const hot = rows.filter(r => r.p >= 70);
        const list = (ent.cat ? rows.filter(r => r.c === ent.cat) : rows.slice(0, 4));
        return {
          reply: hot.length ? `${hot.length} categor${hot.length > 1 ? 'ies are' : 'y is'} above 70% of budget — watch ${hot[0].c} (${hot[0].p}%).` : 'All categories are comfortably within budget.',
          card: verdict(hot.length ? 'caution' : 'safe', '📊 Budget status', ul(list.map(r => `${esc(r.c)}: ${fmt(r.s)} / ${fmt(r.lim)} (${r.p}%)`)))
        };
      }

      case 'rule': {
        const r = get503020();
        return { reply: `Needs ${r.pNeeds}%, wants ${r.pWants}%, savings ${r.pSavings}% (target 50/30/20).`, card: verdict(r.pWants > 30 || r.pNeeds > 50 ? 'caution' : 'safe', '⚖️ 50/30/20 check', ul([`Needs: ${fmt(r.needs)} (${r.pNeeds}%)`, `Wants: ${fmt(r.wants)} (${r.pWants}%)`, `Savings: ${fmt(r.savings)} (${r.pSavings}%)`])) };
      }

      case 'account': {
        const a = acct();
        const others = state.accounts.filter(x => x.id !== a.id);
        return {
          reply: `You're signed in as ${a.name} (${a.role}). There ${others.length === 1 ? 'is' : 'are'} ${others.length} other account(s) on this device.`,
          card: verdict('safe', '👤 Accounts', ul([`Active: ${esc(a.name)} — ${fmt(fin.balance)}`].concat(others.map(o => `${esc(o.name)} — ${fmt(computeBalance(normalizeData(lsGet(dataKey(o.id), null), o.allowance)))}`)).concat(['Switch or Log Out from the Settings tab (password required).'])))
        };
      }

      case 'summary': {
        const txs = monthTx().filter(x => x.type === 'debit');
        const top = topGroups(txs, x => x.category);
        const rows = [`Spent: ${fmt(fin.totalExpenses)} of ${fmt(fin.allowance)} allowance (${Math.round((fin.totalExpenses / (fin.allowance || 1)) * 100)}%)`, `Income: ${fmt(fin.totalIncome)}`, `Balance: ${fmt(fin.balance)} • safe ${fmt(fin.safeDailyLimit)}/day`];
        if (top.length) rows.push('Top categories: ' + top.map(([c, v]) => `${esc(c)} ${fmt(v)}`).join(', '));
        if (D().reminders.length) rows.push(`Dues ahead: ${fmt(upcomingDues())}`);
        return { reply: `This month you've spent ${fmt(fin.totalExpenses)} and have ${fmt(fin.balance)} left.`, card: verdict('safe', '📋 Monthly summary', ul(rows)) };
      }

      case 'tips': {
        const txs = monthTx().filter(x => x.type === 'debit');
        const tips = [];
        const delivery = txs.filter(x => /swiggy|zomato/i.test(x.merchant));
        if (delivery.length) tips.push(`<strong>Cut food delivery:</strong> ${delivery.length} orders cost ${fmt(sum(delivery))}. Skipping half saves ~${fmt(sum(delivery) / 2)}.`);
        const cabs = txs.filter(x => /uber|ola|rapido/i.test(x.merchant));
        if (cabs.length) tips.push(`<strong>Use Metro / Bus pass:</strong> ${cabs.length} cab ride(s) cost ${fmt(sum(cabs))}.`);
        const spent = spendByCategory('month');
        const hot = Object.entries(D().budgetLimits).filter(([c, l]) => l && (spent[c] || 0) / l >= 0.7);
        if (hot.length) tips.push(`<strong>Watch ${esc(hot[0][0])}:</strong> already ${Math.round(((spent[hot[0][0]] || 0) / hot[0][1]) * 100)}% of its monthly cap.`);
        const near = D().goals.filter(g => g.saved < g.target).sort((a, b) => (b.saved / b.target) - (a.saved / a.target))[0];
        if (near) tips.push(`<strong>Finish a goal:</strong> ${fmt(near.target - near.saved)} more completes “${esc(near.title)}”.`);
        tips.push('<strong>50/30/20 Rule:</strong> Keep Needs under 50%, Wants under 30%, and move 20% of your allowance into Savings Goals on Day 1.');
        tips.push(`<strong>Daily Safe Limit:</strong> Staying under ${fmt(fin.safeDailyLimit)}/day guarantees your balance lasts all ${fin.daysRemaining} remaining days.`);
        return { reply: `Here are personalised financial suggestions based on your ledger:`, card: verdict('safe', '💡 EDITH Financial Suggestions', ul(tips.slice(0, 5))) };
      }

      default:
        return null;
    }
  }

  function buildEdithSystemInstruction() {
    const a = acct();
    const fin = calculateFinancials();
    const r50 = get503020();
    const spentByCat = spendByCategory('month');
    const recentTx = D().transactions.slice(0, 12).map(t =>
      `${t.type === 'credit' ? '+' : '-'}₹${t.amount} | ${t.merchant} | ${t.category} | ${formatTxDate(t)}`
    ).join('; ') || 'None yet';
    const goalsList = D().goals.map(g => `${g.title}: ₹${g.saved}/₹${g.target}`).join('; ') || 'None yet';
    const remindersList = D().reminders.map(r => `${r.title}: ₹${r.amount} due ${r.date}`).join('; ') || 'None yet';
    const pendingList = (D().pendingTransactions || []).map(p => `₹${p.amount} (${p.app})`).join('; ') || 'None';
    const catSummary = Object.entries(D().budgetLimits).map(([c, lim]) => `${c}: ₹${spentByCat[c] || 0}/₹${lim}`).join('; ');

    return [
      `You are EDITH, the intelligent financial advisor and app assistant built into "Campus Ledger".`,
      `Your role is to:`,
      `1. Help the user with ANY question about the Campus Ledger app and its features:`,
      `   - Tab 1 (Ledger): Shows Current Balance, Monthly Allowance, Spent this Month, and Safe Daily Limit. Users can add entries ("+ Add Entry"), search/filter transactions, or tap the three-dots (⋮) menu on any transaction to Edit (✏️) or Delete (🗑️) it.`,
      `   - Clipboard Unclassified Transactions: The Android Notification & SMS listener reads all SMS, auto-logging transactions ONLY from PhonePe, Google Pay, Paytm, RuPay, FamPay/FanPay, UPI notifications, and SMS containing Bank names. If the merchant name or category is unknown, it does NOT auto-log; instead it copies the alert to the clipboard and prompts the user to choose the Category, Merchant Name, and Item Purchased.`,
      `   - Tab 2 (Analytics): Shows the 50/30/20 Student Budget Rule (50% Needs, 30% Wants, 20% Savings), Category Donut Chart, 7-Day Spending Trend, and editable Category Monthly Budgets.`,
      `   - Tab 3 (EDITH AI): Voice & text chat with EDITH (tap 🎙️ to speak directly), Savings Goals, and Budget Reminders.`,
      `   - Tab 4 (Settings): Android Notification & SMS Interceptor toggle, EDITH Gemini API Key (stored in account database), Account Balance Configuration, Device Session Security (Log Out asks for current account password, then switches to another account or creates a new account if none is available), and All Accounts manager.`,
      `2. Provide smart, practical, personalized financial suggestions, affordability verdicts, student budgeting tips, saving strategies, and answers to any financial questions.`,
      `3. Live User Financial Data:`,
      `   - Active User: ${a ? a.name : 'User'} (${a ? a.role : 'Student'})`,
      `   - Current Balance: ₹${fin.balance}`,
      `   - Monthly Allowance: ₹${fin.allowance}`,
      `   - Spent This Month: ₹${fin.totalExpenses} | Income This Month: ₹${fin.totalIncome}`,
      `   - Safe Daily Limit: ₹${fin.safeDailyLimit}/day (${fin.daysRemaining} days left in month)`,
      `   - 50/30/20 Split: Needs ₹${r50.needs} (${r50.pNeeds}%), Wants ₹${r50.wants} (${r50.pWants}%), Savings ₹${r50.savings} (${r50.pSavings}%)`,
      `   - Category Budgets (Spent/Limit): ${catSummary}`,
      `   - Recent Transactions: ${recentTx}`,
      `   - Pending Clipboard Transactions Needing Categorization: ${pendingList}`,
      `   - Savings Goals: ${goalsList}`,
      `   - Upcoming Reminders/Dues: ${remindersList}`,
      `Keep answers concise, warm, clear, and actionable (2-5 short sentences or bullet points using **bold** for key numbers). Always use ₹ (INR) for currency.`
    ].join('\n');
  }

  async function callGeminiApi(userQuery) {
    const apiKey = getDatabaseGeminiKey();
    if (!apiKey) return null;

    const systemInstruction = buildEdithSystemInstruction();

    // 1. Try Gemini Interactions API (gemini-3.8-flash per latest Gemini API specification)
    try {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: 'gemini-3.8-flash',
          system_instruction: systemInstruction,
          input: userQuery
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.output_text) return data.output_text.trim();
        if (Array.isArray(data.steps)) {
          const textParts = data.steps
            .filter(s => s.type === 'model_output' && Array.isArray(s.content))
            .flatMap(s => s.content)
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text);
          if (textParts.length) return textParts.join('\n').trim();
        }
      }
    } catch (_e) { /* fall through to secondary endpoint if needed */ }

    // 2. Fallback to standard REST endpoint if the user's key/project uses v1beta models endpoint
    const fallbackModels = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    for (const modelName of fallbackModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents: [{ role: 'user', parts: [{ text: userQuery }] }]
            })
          }
        );
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n').trim();
          if (text) return text;
        }
      } catch (_e) { /* try next */ }
    }

    return null;
  }

  function answerOne(raw) {
    const t = raw.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
    let ent = extractEntities(t);
    let intent = detectIntent(t, ent);

    if (!intent && state.edithCtx && (ent.cat || ent.period || ent.amount)) {
      intent = state.edithCtx.intent;
      const prev = state.edithCtx.ent;
      ent = { amount: ent.amount || prev.amount, period: ent.period || prev.period, cat: ent.cat || prev.cat, item: ent.item || prev.item };
    }
    if (!intent) return null;

    const result = runIntent(intent, ent, t);
    if (result && !['greet', 'thanks', 'help', 'appInfo', 'teach', 'learned', 'addTx'].includes(intent)) {
      state.edithCtx = { intent, ent };
    }
    return result;
  }

  function answerQueryLocal(query) {
    const parts = splitQuestions(query);
    const results = [];
    let allRecognized = true;

    parts.forEach(p => {
      const r = answerOne(p);
      if (r) {
        results.push(r);
      } else {
        allRecognized = false;
        const fin = calculateFinancials();
        const r50 = get503020();
        results.push({
          reply: `Here is your live financial snapshot: your current balance is **${fmt(fin.balance)}** with a safe daily limit of **${fmt(fin.safeDailyLimit)}/day** (${fin.daysRemaining} days left this month). Your 50/30/20 split is **Needs ${r50.pNeeds}%**, **Wants ${r50.pWants}%**, and **Savings ${r50.pSavings}%**. Ask me about any purchase, category budget, savings goal, or app feature!`,
          card: null
        });
      }
    });

    if (results.length === 1) return { ...results[0], allRecognized };
    return {
      reply: results.map((r, i) => `**${i + 1}.** ${r.reply}`).join('\n'),
      card: results.map(r => r.card || '').join(''),
      allRecognized
    };
  }

  function speakEdithReply(rawText) {
    if (!state.ttsEnabled) return;
    const plain = String(rawText || '')
      .replace(/\*\*?/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\n+/g, '. ')
      .trim();
    if (!plain) return;

    // 1. Try native Android TTS bridge first if running inside the APK
    try {
      if (window.CampusAndroid && typeof window.CampusAndroid.speakText === 'function') {
        const spokenNative = window.CampusAndroid.speakText(plain);
        if (spokenNative) return;
      }
    } catch (_e) { /* fall back to web speechSynthesis */ }

    // 2. Web SpeechSynthesis
    try {
      if (window.speechSynthesis && window.SpeechSynthesisUtterance) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(plain);
        u.lang = 'en-IN';
        u.rate = 1.04;
        window.speechSynthesis.speak(u);
      }
    } catch (_e) { /* ignore */ }
  }

  function resetChat() {
    const first = (acct()?.name || 'there').split(' ')[0];
    state.chatMessages = [{
      sender: 'ai',
      text: `👋 Hi ${first}! I am **EDITH**, your voice & financial assistant.\n\n🎙️ Tap **Speak with EDITH** to talk to me directly with your voice, or ask me anything about **Campus Ledger**, your **balance & budgets**, or **financial suggestions**!`
    }];
  }

  async function handleSendChat(customQuery = null) {
    if (!state.isLoggedIn) { showToast('Sign in to chat with EDITH'); openLoginModal(); return; }
    const input = document.getElementById('chatInput');
    const query = (customQuery || (input ? input.value : '')).trim();
    if (!query) return;
    if (input) input.value = '';
    state.chatMessages.push({ sender: 'user', text: query });
    renderChatThread();

    // Check if it's a direct ledger mutation intent (addTx or teach) so we execute it immediately
    const lowerQ = query.toLowerCase().trim();
    const ent = extractEntities(lowerQ);
    const directIntent = detectIntent(lowerQ, ent);
    let localResult = null;

    if (directIntent === 'addTx' || directIntent === 'teach') {
      localResult = runIntent(directIntent, ent, lowerQ);
    } else {
      localResult = answerQueryLocal(query);
    }

    const hasGeminiKey = !!getDatabaseGeminiKey();
    if (hasGeminiKey && directIntent !== 'addTx' && directIntent !== 'teach') {
      // Show thinking indicator while Gemini responds
      const thinkingMsg = { sender: 'ai', text: '✨ *EDITH is thinking...*', card: '' };
      state.chatMessages.push(thinkingMsg);
      renderChatThread();

      const geminiReply = await callGeminiApi(query);
      const idx = state.chatMessages.indexOf(thinkingMsg);
      if (idx !== -1) state.chatMessages.splice(idx, 1);

      if (geminiReply) {
        const card = localResult && localResult.allRecognized ? localResult.card : null;
        state.chatMessages.push({ sender: 'ai', text: geminiReply, card });
        renderChatThread();
        speakEdithReply(geminiReply);
        return;
      }
    }

    // Fallback to fast local engine (or if addTx / teach)
    setTimeout(() => {
      if (!state.isLoggedIn) return;
      state.chatMessages.push({ sender: 'ai', text: localResult.reply, card: localResult.card });
      renderChatThread();
      speakEdithReply(localResult.reply);
    }, 220);
  }

  // --------------------------------------------------------------------------
  // Modal helpers & Add/Edit Transaction modal state
  // --------------------------------------------------------------------------
  function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

  let currentTxModalType = 'debit';

  function setTxModalType(type) {
    currentTxModalType = type === 'credit' ? 'credit' : 'debit';
    document.getElementById('txTypeDebit')?.classList.toggle('active', currentTxModalType === 'debit');
    document.getElementById('txTypeCredit')?.classList.toggle('active', currentTxModalType === 'credit');
  }

  function openAddTransactionModal() {
    state.editingTxId = null;
    setText('txModalTitle', 'Record Transaction');
    setText('saveTxBtn', 'Save Transaction');
    setTxModalType('debit');
    const amtEl = document.getElementById('newTxAmount');
    const merchEl = document.getElementById('newTxMerchant');
    const catEl = document.getElementById('newTxCategory');
    if (amtEl) amtEl.value = '';
    if (merchEl) merchEl.value = '';
    if (catEl) catEl.value = 'Food & Dining';
    openModal('addTxModal');
    setTimeout(() => amtEl?.focus(), 50);
  }

  function openEditTransactionModal(id) {
    const tx = D().transactions.find(t => t.id === id);
    if (!tx) return;
    state.editingTxId = tx.id;
    setText('txModalTitle', 'Edit Transaction');
    setText('saveTxBtn', 'Update Transaction');
    setTxModalType(tx.type === 'credit' ? 'credit' : 'debit');
    const amtEl = document.getElementById('newTxAmount');
    const merchEl = document.getElementById('newTxMerchant');
    const catEl = document.getElementById('newTxCategory');
    if (amtEl) amtEl.value = tx.amount;
    if (merchEl) merchEl.value = tx.merchant;
    if (catEl && tx.category && tx.category !== 'Allowance') {
      catEl.value = tx.category;
    }
    openModal('addTxModal');
    setTimeout(() => amtEl?.focus(), 50);
  }

  // --------------------------------------------------------------------------
  // Event listeners
  // --------------------------------------------------------------------------
  function initEventListeners() {
    const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
    const requireLogin = fn => (...a) => {
      if (!state.isLoggedIn) {
        if (state.accounts.length === 0) openCreateAccountModal(true);
        else openLoginModal();
        return;
      }
      fn(...a);
    };

    // Close open transaction three-dots menu when clicking anywhere outside
    document.addEventListener('click', () => {
      if (state.openMenuTxId !== null) {
        state.openMenuTxId = null;
        renderTransactionList();
      }
    });

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', e => {
        const target = e.currentTarget.getAttribute('data-target');
        state.activeTab = target;
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.tab-slide').forEach(s => s.classList.remove('active'));
        document.getElementById(target)?.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    on('themeToggleBtn', 'click', () => { state.isDarkMode = !state.isDarkMode; savePrefs(); renderThemeAndLayout(); });
    on('aiBackBtn', 'click', () => document.querySelector('.nav-tab[data-target="slide-1"]')?.click());
    on('bannerDismissBtn', 'click', e => {
      e.stopPropagation();
      document.getElementById('headsUpBanner')?.classList.add('hidden');
    });

    // Notification bell
    on('notifBellBtn', 'click', requireLogin(() => {
      renderNotifications();
      openModal('notifModal');
      D().unread = 0;
      saveData();
      renderHeader();
    }));
    on('closeNotifModalBtn', 'click', () => closeModal('notifModal'));
    on('clearNotifBtn', 'click', () => { D().notifications = []; D().unread = 0; saveData(); renderNotifications(); renderHeader(); });

    // Categorize Clipboard Transaction modal
    on('closeCategorizeTxModalBtn', 'click', () => closeModal('categorizeTxModal'));
    on('laterCategorizeTxBtn', 'click', () => {
      closeModal('categorizeTxModal');
      showToast('Saved in Pending Clipboard Transactions on your Ledger.');
    });
    on('confirmCategorizeTxBtn', 'click', requireLogin(handleConfirmCategorizeTransaction));
    on('catModalItem', 'keydown', e => { if (e.key === 'Enter') handleConfirmCategorizeTransaction(); });

    // Balance configuration
    on('editBalanceBtn', 'click', () => {
      document.querySelector('.nav-tab[data-target="slide-4"]')?.click();
      setTimeout(() => document.getElementById('manualBalanceField')?.focus(), 100);
    });
    on('saveManualBalanceBtn', 'click', requireLogin(() => {
      const val = parseFloat(document.getElementById('manualBalanceField')?.value || '');
      if (!isFinite(val) || val < 0) { showToast('Enter a valid balance'); return; }
      D().manualBalance = val;
      D().balanceMode = 'manual';
      saveData(); renderAll(); playAudioChime('success');
      showToast(`Account balance set to ${fmt(val)}.`);
    }));

    // Device Session Security: Password-Protected Log Out & Switch / Create
    on('safeLogoutBtn', 'click', requireLogin(openLogoutConfirmModal));
    on('logoutCancelBtn', 'click', () => closeModal('logoutConfirmModal'));
    on('closeLogoutModalBtn', 'click', () => closeModal('logoutConfirmModal'));
    on('confirmLogoutBtn', 'click', handleConfirmLogoutSubmit);
    on('logoutPasswordInput', 'keydown', e => { if (e.key === 'Enter') handleConfirmLogoutSubmit(); });

    on('switchProfileBtn', 'click', () => openLoginModal());

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        state.activeFilter = e.currentTarget.getAttribute('data-filter');
        renderTransactionList();
      });
    });
    on('txSearchInput', 'input', e => { state.searchQuery = e.target.value; renderTransactionList(); });

    // Capacitor NotificationInterceptor (Trained for PhonePe, GPay, Paytm, RuPay, FamPay, UPI & Bank SMS only)
    const pendingNativeQueue = [];
    const processedNotifIds = new Set();

    function updateAppUI(notificationData) {
      if (!notificationData) return;
      if (notificationData.id && processedNotifIds.has(notificationData.id)) return;
      if (notificationData.id) processedNotifIds.add(notificationData.id);

      if (!state.isLoggedIn) {
        pendingNativeQueue.push(notificationData);
        return;
      }

      const pkg = notificationData.package || '';
      const title = (notificationData.title || '').trim();
      const text = (notificationData.text || '').trim();
      const combined = [title, text].filter(Boolean).join(' — ');
      if (!combined) return;

      // 1. Verify notification source (Only PhonePe, Google Pay, Paytm, RuPay, FamPay, UPI notifications, and Bank SMS)
      const sourceCheck = verifyNotificationSource(pkg, title, text);
      if (!sourceCheck.allowed) {
        // Ignore notifications from unauthorized apps or non-bank SMS
        return;
      }

      const appLabel = sourceCheck.appLabel;
      const parsed = classifySmsText(combined);

      // Must contain a valid transaction amount to be logged or queued
      if (!parsed.amount) return;

      // 2. If merchant name and category are KNOWN -> auto-log transaction
      if (parsed.known && parsed.merchant && parsed.category) {
        handleIncomingNotification(appLabel, text || combined, parsed.amount, parsed.merchant, parsed.category, parsed.type);
      } else {
        // 3. If merchant name or category is UNKNOWN -> do NOT auto-log!
        // Copy to user clipboard and send notification to choose category, merchant name, and item purchased
        handleUnknownTransactionToClipboard(appLabel, text || combined, parsed.amount, parsed.rawMerchantHint);
      }
    }

    async function drainNativePendingNotifications() {
      try {
        if (typeof NotificationInterceptor.drainPending === 'function') {
          const res = await NotificationInterceptor.drainPending();
          if (res && Array.isArray(res.items)) {
            res.items.forEach(item => updateAppUI(item));
          }
        }
      } catch (_e) { /* ignore on web */ }
      while (state.isLoggedIn && pendingNativeQueue.length > 0) {
        updateAppUI(pendingNativeQueue.shift());
      }
    }

    NotificationInterceptor.addListener('onNotificationReceived', (notificationData) => {
      updateAppUI(notificationData);
    });

    async function refreshNotificationPermissionUI() {
      const badge = document.getElementById('notifListenerBadge');
      const label = document.getElementById('enableNotifListenerLabel');
      try {
        const status = await NotificationInterceptor.checkPermission();
        if (status && status.granted) {
          if (badge) {
            badge.textContent = 'Listener Active';
            badge.className = 'badge-emerald';
          }
          if (label) label.textContent = 'Notification Access Enabled';
          await drainNativePendingNotifications();
        } else if (status && status.webFallback) {
          if (badge) {
            badge.textContent = 'Web Mode';
            badge.className = 'badge-amber';
          }
          if (label) label.textContent = 'Download Android APK (Enable Listener)';
        } else {
          if (badge) {
            badge.textContent = 'Permission Needed';
            badge.className = 'badge-rose';
          }
          if (label) label.textContent = 'Enable Notification Access';
        }
      } catch (e) {
        if (badge) badge.textContent = 'Web Mode';
      }
    }

    on('enableNotifListenerBtn', 'click', async () => {
      try {
        const status = await NotificationInterceptor.checkPermission();
        if (status && status.webFallback) {
          showToast('Downloading CampusLedger.apk — install & open the Android app to enable Notification Access!');
          const a = document.createElement('a');
          a.href = './CampusLedger.apk';
          a.download = 'CampusLedger.apk';
          document.body.appendChild(a);
          a.click();
          a.remove();
          return;
        }
        if (status && status.granted) {
          showToast('Notification Listener is active! Opening settings...');
          await NotificationInterceptor.requestPermission();
          return;
        }
        await NotificationInterceptor.requestPermission();
        showToast('Toggle ON "Campus Ledger" in Android Notification Access settings.');
      } catch (err) {
        showToast('Unable to open Android Notification Listener settings.');
      }
    });

    if (typeof window !== 'undefined') {
      window.__onCampusResume = refreshNotificationPermissionUI;
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshNotificationPermissionUI();
    });
    window.addEventListener('focus', refreshNotificationPermissionUI);
    refreshNotificationPermissionUI();

    // ------------------------------------------------------------------------
    // Direct Voice Conversation with EDITH (Native Android + Web Speech API)
    // ------------------------------------------------------------------------
    let recognition = null;
    const micBtn = document.getElementById('micBtn');
    const chatMicBtn = document.getElementById('chatMicBtn');
    const micLabel = document.getElementById('micLabel');
    const chatInput = document.getElementById('chatInput');

    function setVoiceUIState(listening, labelText) {
      state.isListeningVoice = listening;
      micBtn?.classList.toggle('listening', listening);
      chatMicBtn?.classList.toggle('listening', listening);
      if (micLabel) {
        micLabel.textContent = labelText || (listening ? 'EDITH is Listening... Speak now' : 'Tap to Speak with EDITH');
      }
    }

    // Hook native Android voice recognition events from MainActivity.kt
    if (typeof window !== 'undefined') {
      window.__onCampusVoiceEvent = function (ev) {
        if (!ev) return;
        if (ev.state === 'listening') {
          setVoiceUIState(true, '🎙️ Listening... Speak to EDITH');
        } else if (ev.state === 'partial') {
          setVoiceUIState(true, `"${ev.text}..."`);
          if (chatInput) chatInput.value = ev.text;
        } else if (ev.state === 'processing') {
          setVoiceUIState(true, 'Processing your voice...');
        } else if (ev.state === 'result') {
          setVoiceUIState(false, 'Tap to Speak with EDITH');
          if (ev.text) {
            if (chatInput) chatInput.value = '';
            handleSendChat(ev.text);
          }
        } else if (ev.state === 'error') {
          setVoiceUIState(false, 'Tap to Speak with EDITH');
          if (ev.text) showToast(ev.text);
        } else {
          setVoiceUIState(false, 'Tap to Speak with EDITH');
        }
      };
    }

    // Web SpeechRecognition fallback for desktop/mobile browsers
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';
      let finalTranscript = '';

      recognition.onstart = () => {
        finalTranscript = '';
        setVoiceUIState(true, '🎙️ Listening... Speak to EDITH');
      };
      recognition.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalTranscript += tr;
          else interim += tr;
        }
        const preview = (finalTranscript || interim).trim();
        if (preview) {
          setVoiceUIState(true, `"${preview}"`);
          if (chatInput) chatInput.value = preview;
        }
      };
      recognition.onend = () => {
        setVoiceUIState(false, 'Tap to Speak with EDITH');
        const spoken = finalTranscript.trim() || (chatInput ? chatInput.value.trim() : '');
        if (spoken) {
          if (chatInput) chatInput.value = '';
          handleSendChat(spoken);
          finalTranscript = '';
        }
      };
      recognition.onerror = () => {
        setVoiceUIState(false, 'Tap to Speak with EDITH');
      };
    }

    function toggleVoiceListening() {
      if (!state.isLoggedIn) {
        showToast('Sign in to speak with EDITH');
        openLoginModal();
        return;
      }
      // Switch to EDITH tab if not already on it
      if (state.activeTab !== 'slide-3') {
        document.querySelector('.nav-tab[data-target="slide-3"]')?.click();
      }

      // Stop any ongoing TTS reply when user starts speaking
      try {
        if (window.CampusAndroid && typeof window.CampusAndroid.stopSpeak === 'function') {
          window.CampusAndroid.stopSpeak();
        }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      } catch (_e) { /* ignore */ }

      // 1. Native Android APK Voice Recognition
      if (window.CampusAndroid && typeof window.CampusAndroid.startVoiceRecognition === 'function') {
        if (state.isListeningVoice) {
          window.CampusAndroid.stopVoiceRecognition();
          setVoiceUIState(false, 'Tap to Speak with EDITH');
        } else {
          window.CampusAndroid.startVoiceRecognition('en-IN');
        }
        return;
      }

      // 2. Browser Web Speech API
      if (recognition) {
        try {
          if (state.isListeningVoice) recognition.stop();
          else recognition.start();
        } catch (_e) {
          try { recognition.stop(); } catch (__e) {}
          setVoiceUIState(false, 'Tap to Speak with EDITH');
        }
        return;
      }

      showToast('Voice recognition is not supported in this browser. Use the Android app or Chrome!');
    }

    micBtn?.addEventListener('click', toggleVoiceListening);
    chatMicBtn?.addEventListener('click', toggleVoiceListening);

    on('ttsVoiceToggle', 'change', e => {
      state.ttsEnabled = e.target.checked;
      if (!e.target.checked) {
        try {
          if (window.CampusAndroid && typeof window.CampusAndroid.stopSpeak === 'function') {
            window.CampusAndroid.stopSpeak();
          }
          if (window.speechSynthesis) window.speechSynthesis.cancel();
        } catch (_e) {}
      }
    });

    on('sendChatBtn', 'click', () => handleSendChat());
    on('chatInput', 'keydown', e => { if (e.key === 'Enter') handleSendChat(); });

    // Modals
    on('openAddTxModalBtn', 'click', requireLogin(openAddTransactionModal));
    on('openAddGoalModalBtn', 'click', requireLogin(() => openModal('addGoalModal')));
    on('openAddReminderModalBtn', 'click', requireLogin(() => openModal('addReminderModal')));
    on('closeAddTxModalBtn', 'click', () => { state.editingTxId = null; closeModal('addTxModal'); });
    on('closeAddGoalModalBtn', 'click', () => closeModal('addGoalModal'));
    on('closeAddReminderModalBtn', 'click', () => closeModal('addReminderModal'));

    const closeLogin = () => { if (state.isLoggedIn) closeModal('loginModal'); else showToast('Sign in to continue.'); };
    on('loginCloseBtn', 'click', closeLogin);
    on('loginBackBtn', 'click', closeLogin);

    // Multi-account
    const openAdd = () => openCreateAccountModal(false);
    on('openAddAccountModalBtn', 'click', openAdd);
    on('openCreateFromLoginBtn', 'click', openAdd);
    on('closeAddAccountModalBtn', 'click', () => {
      if (state.accounts.length === 0) { showToast('Create an account to get started.'); return; }
      closeModal('addAccountModal');
      if (!state.isLoggedIn) openLoginModal(state.currentId);
    });
    on('addAccountBackBtn', 'click', () => {
      if (state.accounts.length === 0) { showToast('Create an account to get started.'); return; }
      closeModal('addAccountModal');
      if (!state.isLoggedIn) openLoginModal(state.currentId);
    });
    on('saveAccountBtn', 'click', handleCreateAccount);
    on('submitLoginBtn', 'click', handleLoginSubmit);
    on('loginPassword', 'keydown', e => { if (e.key === 'Enter') handleLoginSubmit(); });
    on('loginEmail', 'keydown', e => { if (e.key === 'Enter') handleLoginSubmit(); });

    // Close modals with Escape / overlay click (auth modals stay while logged out)
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
        if ((m.id === 'loginModal' || m.id === 'addAccountModal') && !state.isLoggedIn) return;
        m.classList.add('hidden');
      });
    });
    document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('mousedown', e => {
      if (e.target === m) {
        if ((m.id === 'loginModal' || m.id === 'addAccountModal') && !state.isLoggedIn) return;
        m.classList.add('hidden');
      }
    }));

    // Add or Edit transaction
    on('txTypeDebit', 'click', () => setTxModalType('debit'));
    on('txTypeCredit', 'click', () => setTxModalType('credit'));
    on('saveTxBtn', 'click', requireLogin(() => {
      const amount = parseFloat(document.getElementById('newTxAmount')?.value || '0');
      const merchant = (document.getElementById('newTxMerchant')?.value || '').trim() || 'Manual Entry';
      const category = document.getElementById('newTxCategory')?.value || 'Food & Dining';
      if (!isFinite(amount) || amount <= 0) { showToast('Please enter a valid amount'); return; }

      if (state.editingTxId) {
        updateTransactionInLedger(state.editingTxId, {
          amount,
          merchant,
          category: currentTxModalType === 'credit' ? 'Allowance' : category,
          type: currentTxModalType
        });
        state.editingTxId = null;
        closeModal('addTxModal');
        playAudioChime('success');
        showToast(`Transaction updated: ${currentTxModalType === 'debit' ? '-' : '+'}${fmt(amount)}`);
      } else {
        addTransactionToLedger({
          id: `tx-${Date.now()}`,
          amount,
          merchant,
          category: currentTxModalType === 'credit' ? 'Allowance' : category,
          type: currentTxModalType,
          isAi: false
        });
        closeModal('addTxModal');
        playAudioChime('success');
        showToast(`Transaction recorded: ${currentTxModalType === 'debit' ? '-' : '+'}${fmt(amount)}`);
      }
      ['newTxAmount', 'newTxMerchant'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }));

    on('saveGoalBtn', 'click', requireLogin(() => {
      const title = (document.getElementById('newGoalTitle')?.value || '').trim() || 'New Goal';
      const target = parseFloat(document.getElementById('newGoalTarget')?.value || '');
      const initial = parseFloat(document.getElementById('newGoalInitial')?.value || '0') || 0;
      if (!isFinite(target) || target <= 0) { showToast('Enter a valid target amount'); return; }
      D().goals.push({ id: `g-${Date.now()}`, title, target, saved: Math.min(Math.max(0, initial), target), icon: '🎯' });
      saveData(); closeModal('addGoalModal'); renderSlide3(); playAudioChime('success'); showToast('Goal created');
      ['newGoalTitle', 'newGoalTarget', 'newGoalInitial'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }));

    // Contribute to Goal modal (user decides amount & method)
    on('closeContributeGoalModalBtn', 'click', () => {
      state.activeGoalId = null;
      closeModal('contributeGoalModal');
    });
    on('confirmContributeGoalBtn', 'click', requireLogin(handleConfirmContributeGoal));
    on('contribGoalAmount', 'keydown', e => { if (e.key === 'Enter') handleConfirmContributeGoal(); });
    on('contribGoalNote', 'keydown', e => { if (e.key === 'Enter') handleConfirmContributeGoal(); });

    document.querySelectorAll('.goal-quick-amt-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const raw = e.currentTarget.getAttribute('data-amt');
        const amtInput = document.getElementById('contribGoalAmount');
        if (!amtInput) return;
        if (raw === 'remaining') {
          const goal = D().goals.find(g => g.id === state.activeGoalId);
          const rem = goal ? Math.max(0, goal.target - goal.saved) : 0;
          amtInput.value = rem > 0 ? rem : 500;
        } else {
          const current = parseFloat(amtInput.value || '0') || 0;
          amtInput.value = current + (parseFloat(raw || '0') || 0);
        }
        amtInput.focus();
      });
    });

    on('saveReminderBtn', 'click', requireLogin(() => {
      const title = (document.getElementById('newReminderTitle')?.value || '').trim() || 'New Reminder';
      const amount = parseFloat(document.getElementById('newReminderAmount')?.value || '0') || 0;
      const date = document.getElementById('newReminderDate')?.value || 'Soon';
      D().reminders.push({ id: `r-${Date.now()}`, title, amount: Math.max(0, amount), date });
      saveData(); closeModal('addReminderModal'); renderSlide3(); playAudioChime('success'); showToast('Reminder added');
      ['newReminderTitle', 'newReminderAmount', 'newReminderDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }));
  }

  // --------------------------------------------------------------------------
  // Entry point
  // --------------------------------------------------------------------------
  async function initApp() {
    await bootstrap();
    initEventListeners();
    renderAll();
    if (state.accounts.length === 0) {
      openCreateAccountModal(true);
    } else if (!state.isLoggedIn) {
      openLoginModal(state.currentId);
    }
    console.log('🏛️ Campus Ledger initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
