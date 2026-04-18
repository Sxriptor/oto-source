const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("monitorApi", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  sendAlert: (payload, config) => ipcRenderer.invoke("alerts:send", { payload, config }),
  getBrowserStatus: () => ipcRenderer.invoke("browser:get-status"),
  openTarget: (targetUrl) => ipcRenderer.invoke("browser:open-target", targetUrl),
  refreshBrowser: () => ipcRenderer.invoke("browser:refresh"),
  stopBrowser: () => ipcRenderer.invoke("browser:stop"),
  shutdownBrowser: (reason) => ipcRenderer.invoke("browser:shutdown", reason),
  goBack: () => ipcRenderer.invoke("browser:back"),
  goForward: () => ipcRenderer.invoke("browser:forward"),
  openGoogleVoiceCall: (phoneNumber) =>
    ipcRenderer.invoke("browser:open-google-voice-call", phoneNumber),
  checkPageText: (payload) => ipcRenderer.invoke("browser:check-text", payload),
  getGmailAuthStatus: (config) => ipcRenderer.invoke("gmail:auth-status", config),
  gmailSignIn: (config) => ipcRenderer.invoke("gmail:auth-sign-in", config),
  gmailDisconnect: () => ipcRenderer.invoke("gmail:auth-disconnect"),
  getGmailWatcherStatus: () => ipcRenderer.invoke("gmail:watcher-status"),
  startGmailWatcher: (config) => ipcRenderer.invoke("gmail:watcher-start", config),
  stopGmailWatcher: () => ipcRenderer.invoke("gmail:watcher-stop"),
  onBrowserEvent: (listener) => {
    const wrapped = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("browser:event", wrapped);

    return () => {
      ipcRenderer.removeListener("browser:event", wrapped);
    };
  },
  onGmailWatcherEvent: (listener) => {
    const wrapped = (_event, payload) => {
      listener(payload);
    };

    ipcRenderer.on("gmail-watcher:event", wrapped);

    return () => {
      ipcRenderer.removeListener("gmail-watcher:event", wrapped);
    };
  }
});
