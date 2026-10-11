/*! Capacitor Core ES Module Bridge (@capacitor/core) */
var ExceptionCode;
(function (ExceptionCode) {
  ExceptionCode["Unimplemented"] = "UNIMPLEMENTED";
  ExceptionCode["Unavailable"] = "UNAVAILABLE";
})(ExceptionCode || (ExceptionCode = {}));

class CapacitorException extends Error {
  constructor(message, code, data) {
    super(message);
    this.message = message;
    this.code = code;
    this.data = data;
  }
}

const getPlatformId = (win) => {
  if (win?.androidBridge) {
    return 'android';
  } else if (win?.webkit?.messageHandlers?.bridge) {
    return 'ios';
  } else {
    return 'web';
  }
};

class WebPlugin {
  constructor() {
    this.listeners = {};
    this.retainedEventArguments = {};
    this.windowListeners = {};
  }
  addListener(eventName, listenerFunc) {
    let firstListener = false;
    const listeners = this.listeners[eventName];
    if (!listeners) {
      this.listeners[eventName] = [];
      firstListener = true;
    }
    this.listeners[eventName].push(listenerFunc);
    const windowListener = this.windowListeners[eventName];
    if (windowListener && !windowListener.registered) {
      this.addWindowListener(windowListener);
    }
    if (firstListener) {
      this.sendRetainedArgumentsForEvent(eventName);
    }
    const remove = async () => this.removeListener(eventName, listenerFunc);
    return Promise.resolve({ remove });
  }
  async removeAllListeners() {
    this.listeners = {};
    for (const listener in this.windowListeners) {
      this.removeWindowListener(this.windowListeners[listener]);
    }
    this.windowListeners = {};
  }
  notifyListeners(eventName, data, retainUntilConsumed) {
    const listeners = this.listeners[eventName];
    if (!listeners) {
      if (retainUntilConsumed) {
        let args = this.retainedEventArguments[eventName];
        if (!args) {
          args = [];
        }
        args.push(data);
        this.retainedEventArguments[eventName] = args;
      }
      return;
    }
    listeners.forEach((listener) => listener(data));
  }
  hasListeners(eventName) {
    return !!this.listeners[eventName]?.length;
  }
  registerWindowListener(windowEventName, pluginEventName) {
    this.windowListeners[pluginEventName] = {
      registered: false,
      windowEventName,
      pluginEventName,
      handler: (event) => {
        this.notifyListeners(pluginEventName, event);
      },
    };
  }
  unimplemented(msg = 'not implemented') {
    return new Capacitor.Exception(msg, ExceptionCode.Unimplemented);
  }
  unavailable(msg = 'not available') {
    return new Capacitor.Exception(msg, ExceptionCode.Unavailable);
  }
  async removeListener(eventName, listenerFunc) {
    const listeners = this.listeners[eventName];
    if (!listeners) return;
    const index = listeners.indexOf(listenerFunc);
    this.listeners[eventName].splice(index, 1);
    if (!this.listeners[eventName].length) {
      this.removeWindowListener(this.windowListeners[eventName]);
    }
  }
  addWindowListener(handle) {
    window.addEventListener(handle.windowEventName, handle.handler);
    handle.registered = true;
  }
  removeWindowListener(handle) {
    if (!handle) return;
    window.removeEventListener(handle.windowEventName, handle.handler);
    handle.registered = false;
  }
  sendRetainedArgumentsForEvent(eventName) {
    const args = this.retainedEventArguments[eventName];
    if (!args) return;
    delete this.retainedEventArguments[eventName];
    args.forEach((arg) => {
      this.notifyListeners(eventName, arg);
    });
  }
}

class DefaultWebFallbackPlugin extends WebPlugin {
  async checkPermission() {
    return { granted: false, webFallback: true };
  }
  async requestPermission() {
    return { opened: false, granted: false, webFallback: true };
  }
  async drainPending() {
    return { items: [] };
  }
}

const createCapacitor = (win) => {
  const capCustomPlatform = win.CapacitorCustomPlatform || null;
  const cap = win.Capacitor || {};
  const Plugins = (cap.Plugins = cap.Plugins || {});

  const getPlatform = () => {
    return capCustomPlatform !== null ? capCustomPlatform.name : getPlatformId(win);
  };
  const isNativePlatform = () => getPlatform() !== 'web';
  const getPluginHeader = (pluginName) => cap.PluginHeaders?.find((h) => h.name === pluginName);

  const isPluginAvailable = (pluginName) => {
    const plugin = registeredPlugins.get(pluginName);
    if (plugin?.platforms.has(getPlatform())) {
      return true;
    }
    if (getPluginHeader(pluginName)) {
      return true;
    }
    return false;
  };

  const handleError = (err) => win.console.error(err);
  const registeredPlugins = new Map();

  const registerPlugin = (pluginName, jsImplementations = {}) => {
    const registeredPlugin = registeredPlugins.get(pluginName);
    if (registeredPlugin) {
      return registeredPlugin.proxy;
    }
    const platform = getPlatform();
    const pluginHeader = getPluginHeader(pluginName);
    if (!jsImplementations.web) {
      jsImplementations = { ...jsImplementations, web: () => new DefaultWebFallbackPlugin() };
    }
    let jsImplementation;
    const loadPluginImplementation = async () => {
      if (!jsImplementation && platform in jsImplementations) {
        jsImplementation =
          typeof jsImplementations[platform] === 'function'
            ? (jsImplementation = await jsImplementations[platform]())
            : (jsImplementation = jsImplementations[platform]);
      } else if (capCustomPlatform !== null && !jsImplementation && 'web' in jsImplementations) {
        jsImplementation =
          typeof jsImplementations['web'] === 'function'
            ? (jsImplementation = await jsImplementations['web']())
            : (jsImplementation = jsImplementations['web']);
      }
      return jsImplementation;
    };

    const createPluginMethod = (impl, prop) => {
      if (pluginHeader) {
        const methodHeader = pluginHeader?.methods.find((m) => prop === m.name);
        if (methodHeader) {
          if (methodHeader.rtype === 'promise') {
            return (options) => cap.nativePromise(pluginName, prop.toString(), options);
          } else {
            return (options, callback) => cap.nativeCallback(pluginName, prop.toString(), options, callback);
          }
        } else if (impl) {
          return impl[prop]?.bind(impl);
        }
      } else if (impl) {
        return impl[prop]?.bind(impl);
      } else {
        throw new CapacitorException(`"${pluginName}" plugin is not implemented on ${platform}`, ExceptionCode.Unimplemented);
      }
    };

    const createPluginMethodWrapper = (prop) => {
      let remove;
      const wrapper = (...args) => {
        const p = loadPluginImplementation().then((impl) => {
          const fn = createPluginMethod(impl, prop);
          if (fn) {
            const p = fn(...args);
            remove = p?.remove;
            return p;
          } else {
            throw new CapacitorException(`"${pluginName}.${prop}()" is not implemented on ${platform}`, ExceptionCode.Unimplemented);
          }
        });
        if (prop === 'addListener') {
          p.remove = async () => remove();
        }
        return p;
      };
      wrapper.toString = () => `${prop.toString()}() { [capacitor code] }`;
      Object.defineProperty(wrapper, 'name', {
        value: prop,
        writable: false,
        configurable: false,
      });
      return wrapper;
    };

    const addListener = createPluginMethodWrapper('addListener');
    const removeListener = createPluginMethodWrapper('removeListener');
    const addListenerNative = (eventName, callback) => {
      const call = addListener({ eventName }, callback);
      const remove = async () => {
        const callbackId = await call;
        removeListener({ eventName, callbackId }, callback);
      };
      const p = new Promise((resolve) => call.then(() => resolve({ remove })));
      p.remove = async () => {
        await remove();
      };
      return p;
    };

    const proxy = new Proxy(
      {},
      {
        get(_, prop) {
          switch (prop) {
            case '$$typeof':
              return undefined;
            case 'toJSON':
              return () => ({});
            case 'addListener':
              return pluginHeader ? addListenerNative : addListener;
            case 'removeListener':
              return removeListener;
            default:
              return createPluginMethodWrapper(prop);
          }
        },
      }
    );

    Plugins[pluginName] = proxy;
    registeredPlugins.set(pluginName, {
      name: pluginName,
      proxy,
      platforms: new Set([...Object.keys(jsImplementations), ...(pluginHeader ? [platform] : [])]),
    });
    return proxy;
  };

  if (!cap.convertFileSrc) {
    cap.convertFileSrc = (filePath) => filePath;
  }
  cap.getPlatform = getPlatform;
  cap.handleError = handleError;
  cap.isNativePlatform = isNativePlatform;
  cap.isPluginAvailable = isPluginAvailable;
  cap.registerPlugin = registerPlugin;
  cap.Exception = CapacitorException;
  cap.DEBUG = !!cap.DEBUG;
  cap.isLoggingEnabled = !!cap.isLoggingEnabled;
  return cap;
};

export const Capacitor = (window.Capacitor = createCapacitor(window));
export const registerPlugin = Capacitor.registerPlugin;
export { CapacitorException, ExceptionCode, WebPlugin };
