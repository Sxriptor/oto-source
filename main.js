const { app, BrowserWindow, Notification, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const path = require("node:path");
const nodemailer = require("nodemailer");
const { createGmailWatcherService } = require("./gmailWatcher");

const APP_NAME = "OTO";
const CONFIG_FILE_NAME = "config.json";
const CHROME_PROFILE_DIR_NAME = "chrome-profile";
const CHROME_CONNECT_TIMEOUT_MS = 20000;
const CHROME_CONNECT_POLL_MS = 250;
const CHROME_DEBUGGING_PORT = 46871;
const GOOGLE_VOICE_AUTOMATION_INITIAL_DELAY_MS = 2000;
const GOOGLE_VOICE_AUTOMATION_STEP_DELAY_MS = 120;

function getChromeCandidatePaths() {
  if (process.platform === "win32") {
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData =
      process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");

    return [
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFiles, "Google", "Chrome Beta", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome Beta", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome Beta", "Application", "chrome.exe"),
      path.join(programFiles, "Google", "Chrome SxS", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome SxS", "Application", "chrome.exe")
    ];
  }

  return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
  ];
}

const defaultConfig = {
  targetUrl: "",
  searchText: "",
  matchMode: "contains",
  caseSensitive: false,
  refreshIntervalSeconds: 30,
  refreshJitterSeconds: 10,
  scheduleStartTime: "",
  scheduleEndTime: "",
  customUserAgent: "",
  discordWebhookUrl: "",
  discordRepeatCount: 5,
  discordRepeatDelaySeconds: 5,
  googleVoice: {
    phoneNumber: ""
  },
  gmailWatcher: {
    clientId: "",
    clientSecret: "",
    sender: "",
    subjectContains: "",
    checkIntervalSeconds: 30,
    onlyUnread: true,
    markAsProcessed: false,
    allowRepeatedAlerts: false
  },
  smtp: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
    to: ""
  }
};

let mainWindow = null;
let cachedConfig = null;
let gmailWatcherService = null;

const chromeState = {
  executablePath: "",
  profileDir: "",
  process: null,
  debuggingPort: 0,
  targetId: "",
  targetWebSocketUrl: "",
  targetSocket: null,
  nextCommandId: 0,
  pendingCommands: new Map(),
  currentUrl: "",
  currentTitle: "",
  currentUserAgent: "",
  lastStatusReason: "idle"
};

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE_NAME);
}

function getChromeProfileDir() {
  return path.join(app.getPath("userData"), CHROME_PROFILE_DIR_NAME);
}

function getCleanUserAgent() {
  return app.userAgentFallback.replace(/\sElectron\/[^\s]+/, "");
}

function normalizeConfig(input = {}) {
  const legacySelector =
    typeof input.selector === "string" && input.selector.trim() ? input.selector.trim() : "";
  const searchText =
    typeof input.searchText === "string" && input.searchText.trim()
      ? input.searchText.trim()
      : legacySelector;
  const matchMode = input.matchMode === "missing" ? "missing" : "contains";
  const discordRepeatCount = Number(input.discordRepeatCount);
  const discordRepeatDelaySeconds = Number(input.discordRepeatDelaySeconds);
  const refreshIntervalSeconds = Number(input.refreshIntervalSeconds);
  const refreshJitterSeconds = Number(input.refreshJitterSeconds);
  const smtpPort = Number(input?.smtp?.port);
  const inferredSmtpEnabled = Boolean(
    input?.smtp &&
      typeof input.smtp === "object" &&
      (input.smtp.host || input.smtp.user || input.smtp.to || input.smtp.from)
  );
  const smtpEnabled =
    typeof input?.smtp?.enabled === "boolean" ? input.smtp.enabled : inferredSmtpEnabled;

  return {
    targetUrl: typeof input.targetUrl === "string" ? input.targetUrl.trim() : "",
    searchText,
    matchMode,
    caseSensitive: Boolean(input.caseSensitive),
    refreshIntervalSeconds:
      Number.isFinite(refreshIntervalSeconds) && refreshIntervalSeconds >= 1
        ? refreshIntervalSeconds
        : defaultConfig.refreshIntervalSeconds,
    refreshJitterSeconds:
      Number.isFinite(refreshJitterSeconds) && refreshJitterSeconds >= 0
        ? Math.min(10, Math.floor(refreshJitterSeconds))
        : defaultConfig.refreshJitterSeconds,
    scheduleStartTime: typeof input.scheduleStartTime === "string" ? input.scheduleStartTime : "",
    scheduleEndTime: typeof input.scheduleEndTime === "string" ? input.scheduleEndTime : "",
    customUserAgent: typeof input.customUserAgent === "string" ? input.customUserAgent.trim() : "",
    discordWebhookUrl:
      typeof input.discordWebhookUrl === "string" ? input.discordWebhookUrl.trim() : "",
    discordRepeatCount:
      Number.isFinite(discordRepeatCount) && discordRepeatCount >= 1
        ? Math.floor(discordRepeatCount)
        : defaultConfig.discordRepeatCount,
    discordRepeatDelaySeconds:
      Number.isFinite(discordRepeatDelaySeconds) && discordRepeatDelaySeconds >= 0
        ? discordRepeatDelaySeconds
        : defaultConfig.discordRepeatDelaySeconds,
    googleVoice: {
      phoneNumber:
        typeof input?.googleVoice?.phoneNumber === "string"
          ? input.googleVoice.phoneNumber.trim()
          : ""
    },
    gmailWatcher: {
      clientId:
        typeof input?.gmailWatcher?.clientId === "string"
          ? input.gmailWatcher.clientId.trim()
          : "",
      clientSecret:
        typeof input?.gmailWatcher?.clientSecret === "string"
          ? input.gmailWatcher.clientSecret.trim()
          : "",
      sender:
        typeof input?.gmailWatcher?.sender === "string" ? input.gmailWatcher.sender.trim() : "",
      subjectContains:
        typeof input?.gmailWatcher?.subjectContains === "string"
          ? input.gmailWatcher.subjectContains.trim()
          : "",
      checkIntervalSeconds:
        Number.isFinite(Number(input?.gmailWatcher?.checkIntervalSeconds)) &&
        Number(input.gmailWatcher.checkIntervalSeconds) >= 5
          ? Number(input.gmailWatcher.checkIntervalSeconds)
          : defaultConfig.gmailWatcher.checkIntervalSeconds,
      onlyUnread:
        typeof input?.gmailWatcher?.onlyUnread === "boolean"
          ? input.gmailWatcher.onlyUnread
          : defaultConfig.gmailWatcher.onlyUnread,
      markAsProcessed: Boolean(input?.gmailWatcher?.markAsProcessed),
      allowRepeatedAlerts: Boolean(input?.gmailWatcher?.allowRepeatedAlerts)
    },
    smtp: {
      enabled: smtpEnabled,
      host: typeof input?.smtp?.host === "string" ? input.smtp.host.trim() : "",
      port: Number.isFinite(smtpPort) && smtpPort > 0 ? smtpPort : defaultConfig.smtp.port,
      secure: Boolean(input?.smtp?.secure),
      user: typeof input?.smtp?.user === "string" ? input.smtp.user.trim() : "",
      pass: typeof input?.smtp?.pass === "string" ? input.smtp.pass : "",
      from: typeof input?.smtp?.from === "string" ? input.smtp.from.trim() : "",
      to: typeof input?.smtp?.to === "string" ? input.smtp.to.trim() : ""
    }
  };
}

async function readConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = await fs.readFile(getConfigPath(), "utf8");
    cachedConfig = normalizeConfig(JSON.parse(raw));
    return cachedConfig;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    cachedConfig = normalizeConfig(defaultConfig);
    return cachedConfig;
  }
}

async function writeConfig(config) {
  const nextConfig = normalizeConfig(config);
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(nextConfig, null, 2), "utf8");
  cachedConfig = nextConfig;
  return nextConfig;
}

function hasMailConfig(smtp) {
  return Boolean(smtp?.enabled && smtp.host && smtp.to && (smtp.from || smtp.user));
}

function hasDiscordWebhook(url) {
  return Boolean(url);
}

function normalizeGoogleVoicePhoneNumber(phoneNumber) {
  const rawValue = String(phoneNumber || "").trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("+")) {
    const digitsOnly = rawValue.slice(1).replace(/\D/g, "");
    return digitsOnly ? `+${digitsOnly}` : "";
  }

  const digitsOnly = rawValue.replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }

  // Default bare 10-digit numbers to NANP (+1) so US local numbers
  // don't get interpreted as international country codes by Google Voice.
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }

  return `+${digitsOnly}`;
}

function hasGoogleVoiceNumber(googleVoice) {
  return Boolean(normalizeGoogleVoicePhoneNumber(googleVoice?.phoneNumber));
}

function buildGoogleVoiceCallUrl(phoneNumber) {
  const normalizedPhoneNumber = normalizeGoogleVoicePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error("A Google Voice phone number is required.");
  }

  return `https://voice.google.com/calls?a=nc,${encodeURIComponent(normalizedPhoneNumber)}`;
}

async function openGoogleVoiceCallTab(phoneNumber) {
  const normalizedPhoneNumber = normalizeGoogleVoicePhoneNumber(phoneNumber);

  if (!normalizedPhoneNumber) {
    throw new Error("A valid Google Voice phone number is required.");
  }

  await ensureChromeProcess();
  const voiceUrls = [
    buildGoogleVoiceCallUrl(normalizedPhoneNumber),
    `https://voice.google.com/u/0/calls?a=nc,${encodeURIComponent(normalizedPhoneNumber)}`,
    `https://voice.google.com/calls`
  ];
  const target = await createChromeTarget("about:blank");
  const session = await createDetachedChromeTargetSession(target);
  let resolvedUrl = "";

  try {
    await session.sendCommand("Page.enable");
    resolvedUrl = await navigateVoiceTarget(session.sendCommand, voiceUrls);
  } finally {
    session.close();
  }

  await automateGoogleVoiceCallTarget(target);

  return {
    phoneNumber: normalizedPhoneNumber,
    url: resolvedUrl || voiceUrls[0]
  };
}

async function sendEmailAlert(smtp, payload) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
  });

  return transporter.sendMail({
    from: smtp.from || smtp.user,
    to: smtp.to,
    subject: payload.subject,
    text: payload.text
  });
}

async function sendDiscordAlert(webhookUrl, payload) {
  const body = {
    username: APP_NAME,
    allowed_mentions: {
      parse: []
    },
    embeds: [
      {
        title: payload.subject,
        description: payload.text.slice(0, 4000),
        color: 0x55bceb,
        timestamp: new Date().toISOString()
      }
    ]
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status} ${response.statusText}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendDiscordAlertBurst(config, payload) {
  let sentCount = 0;
  const repeatCount = Math.max(1, Number(config.discordRepeatCount) || 1);
  const repeatDelayMs = Math.max(0, Number(config.discordRepeatDelaySeconds) || 0) * 1000;

  for (let index = 0; index < repeatCount; index += 1) {
    await sendDiscordAlert(config.discordWebhookUrl, payload);
    sentCount += 1;

    if (index < repeatCount - 1 && repeatDelayMs > 0) {
      await delay(repeatDelayMs);
    }
  }

  return sentCount;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findChromeExecutablePath() {
  if (chromeState.executablePath && (await pathExists(chromeState.executablePath))) {
    return chromeState.executablePath;
  }

  for (const candidate of getChromeCandidatePaths()) {
    if (await pathExists(candidate)) {
      chromeState.executablePath = candidate;
      return candidate;
    }
  }

  chromeState.executablePath = "";
  return "";
}

function getChromeAppBundlePath(chromePath) {
  return path.dirname(path.dirname(path.dirname(chromePath)));
}

function getBrowserSnapshot() {
  const connected = Boolean(
    chromeState.targetSocket && chromeState.targetSocket.readyState === WebSocket.OPEN
  );
  const pageOpen = connected;

  return {
    type: "chrome",
    chromeAvailable: Boolean(chromeState.executablePath),
    chromePath: chromeState.executablePath,
    profileDir: chromeState.profileDir || getChromeProfileDir(),
    connected,
    pageOpen,
    url: chromeState.currentUrl || "",
    title: chromeState.currentTitle || "",
    userAgent: chromeState.currentUserAgent || "",
    reason: chromeState.lastStatusReason
  };
}

function emitBrowserState(reason) {
  chromeState.lastStatusReason = reason;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("browser:event", {
      type: "browser-state",
      reason,
      browser: getBrowserSnapshot()
    });
  }
}

function emitGmailWatcherState(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gmail-watcher:event", payload);
  }
}

function rejectPendingChromeCommands(message) {
  for (const pending of chromeState.pendingCommands.values()) {
    pending.reject(new Error(message));
  }

  chromeState.pendingCommands.clear();
}

function closeChromeTargetSocket(reason) {
  if (chromeState.targetSocket) {
    try {
      chromeState.targetSocket.close();
    } catch {
      // Ignore close errors for stale sockets.
    }
  }

  chromeState.targetSocket = null;
  chromeState.targetWebSocketUrl = "";
  rejectPendingChromeCommands(reason);
}

function resetChromePage(reason) {
  closeChromeTargetSocket(reason);
  chromeState.targetId = "";
  chromeState.currentUrl = "";
  chromeState.currentTitle = "";
  chromeState.currentUserAgent = "";
  emitBrowserState(reason);
}

async function closeChromeBrowser(port) {
  try {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
    const wsUrl = version?.webSocketDebuggerUrl;
    if (!wsUrl) {
      return false;
    }

    await new Promise((resolve) => {
      const socket = new WebSocket(wsUrl);

      socket.addEventListener(
        "open",
        () => {
          try {
            socket.send(JSON.stringify({ id: 1, method: "Browser.close", params: {} }));
          } catch {
            // Ignore send errors; Chrome might already be closing.
          }

          resolve();
        },
        { once: true }
      );

      socket.addEventListener("error", () => resolve(), { once: true });
    });

    await delay(300);
    return true;
  } catch {
    return false;
  }
}

async function stopChromeSession(reason = "page-closed", options = {}) {
  const { closeBrowser = false } = options || {};
  const targetId = chromeState.targetId;
  const port = chromeState.debuggingPort || CHROME_DEBUGGING_PORT;

  closeChromeTargetSocket("Chrome session stopped.");
  chromeState.process = null;

  if (targetId) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
    } catch {
      // Ignore close errors; we still reset local state below.
    }
  }

  if (closeBrowser) {
    await closeChromeBrowser(port);
  }

  resetChromePage(reason);
  return getBrowserSnapshot();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchChromeEndpoint(pathname, options) {
  return fetchJson(`http://127.0.0.1:${chromeState.debuggingPort}${pathname}`, options);
}

async function waitForChromeDebugger(port, timeoutMs = CHROME_CONNECT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`);
      return;
    } catch {
      await delay(CHROME_CONNECT_POLL_MS);
    }
  }

  throw new Error("Timed out waiting for Google Chrome to expose its debugging port.");
}

async function isLocalPortFree(port) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once("error", () => resolve(false))
      .once("listening", () => {
        server.close(() => resolve(true));
      })
      .listen({ port, host: "127.0.0.1" });

    server.unref();
  });
}

async function pickChromeDebuggingPort(preferredPort) {
  if (await isLocalPortFree(preferredPort)) {
    return preferredPort;
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = 45000 + Math.floor(Math.random() * 15000);
    if (await isLocalPortFree(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No free local TCP port was available for Chrome remote debugging. Close any apps using port 46871 and try again."
  );
}

async function ensureChromeProcess() {
  const chromePath = await findChromeExecutablePath();

  if (!chromePath) {
    throw new Error(
      process.platform === "win32"
        ? "Google Chrome was not found in the standard Windows install paths."
        : "Google Chrome.app was not found in /Applications."
    );
  }

  chromeState.profileDir = getChromeProfileDir();
  await fs.mkdir(chromeState.profileDir, { recursive: true });
  chromeState.debuggingPort = CHROME_DEBUGGING_PORT;

  try {
    await fetchJson(`http://127.0.0.1:${chromeState.debuggingPort}/json/version`);
    return;
  } catch {
    // Chrome is not yet listening on the controller port.
  }

  chromeState.debuggingPort = await pickChromeDebuggingPort(CHROME_DEBUGGING_PORT);
  resetChromePage("starting-chrome");
  const chromeArgs = [
    `--user-data-dir=${chromeState.profileDir}`,
    `--remote-debugging-port=${chromeState.debuggingPort}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ];

  chromeState.process = spawn("open", ["-gna", getChromeAppBundlePath(chromePath), "--args", ...chromeArgs], {
    stdio: "ignore"
  });

  try {
    await waitForChromeDebugger(chromeState.debuggingPort);
  } catch {
    chromeState.process = spawn(chromePath, chromeArgs, { stdio: "ignore", detached: true });
    await waitForChromeDebugger(chromeState.debuggingPort, CHROME_CONNECT_TIMEOUT_MS * 2);
  }

  chromeState.process = null;
  emitBrowserState("chrome-started");
}

async function listChromeTargets() {
  await ensureChromeProcess();
  return fetchChromeEndpoint("/json/list");
}

async function createChromeTarget(url) {
  const targetUrl = url || "about:blank";
  let lastError = null;

  for (const method of ["PUT", "GET"]) {
    try {
      return await fetchChromeEndpoint(`/json/new?${encodeURIComponent(targetUrl)}`, { method });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to create a new Google Chrome tab.");
}

function pickChromeTarget(targets) {
  const pageTargets = targets.filter((item) => item.type === "page");

  if (chromeState.targetId) {
    const existingTarget = pageTargets.find((item) => item.id === chromeState.targetId);

    if (existingTarget) {
      return existingTarget;
    }
  }

  const blankTarget = pageTargets.find((item) => item.url === "about:blank");
  if (blankTarget) {
    return blankTarget;
  }

  const newTabTarget = pageTargets.find((item) => item.url.startsWith("chrome://newtab"));
  if (newTabTarget) {
    return newTabTarget;
  }

  return pageTargets[0] || null;
}

function handleChromeSocketMessage(rawData) {
  const data = typeof rawData === "string" ? rawData : rawData.toString();
  const message = JSON.parse(data);

  if (message.id) {
    const pending = chromeState.pendingCommands.get(message.id);

    if (!pending) {
      return;
    }

    chromeState.pendingCommands.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || "Chrome command failed."));
      return;
    }

    pending.resolve(message.result || {});
    return;
  }

  if (message.method === "Page.loadEventFired") {
    void pushBrowserState("page-loaded");
    return;
  }

  if (message.method === "Page.frameNavigated" && !message.params?.frame?.parentId) {
    chromeState.currentUrl = message.params.frame.url || chromeState.currentUrl;
    emitBrowserState("page-navigated");
  }
}

async function connectToChromeTarget(target) {
  chromeState.targetId = target.id;

  if (
    chromeState.targetSocket &&
    chromeState.targetWebSocketUrl === target.webSocketDebuggerUrl &&
    chromeState.targetSocket.readyState === WebSocket.OPEN
  ) {
    return;
  }

  closeChromeTargetSocket("Replacing Chrome tab connection.");
  chromeState.targetWebSocketUrl = target.webSocketDebuggerUrl;

  const socket = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    const handleOpen = () => {
      socket.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      socket.removeEventListener("open", handleOpen);
      reject(new Error("Failed to connect to the Google Chrome tab."));
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

  chromeState.targetSocket = socket;

  socket.addEventListener("message", (event) => {
    handleChromeSocketMessage(event.data);
  });

  socket.addEventListener("close", () => {
    if (chromeState.targetSocket === socket) {
      chromeState.targetSocket = null;
      chromeState.targetWebSocketUrl = "";
      rejectPendingChromeCommands("Google Chrome tab connection closed.");
      chromeState.targetId = "";
      chromeState.currentUrl = "";
      chromeState.currentTitle = "";
      chromeState.currentUserAgent = "";
      emitBrowserState("page-closed");
    }
  });

  socket.addEventListener("error", () => {
    if (chromeState.targetSocket === socket) {
      rejectPendingChromeCommands("Google Chrome tab connection failed.");
    }
  });

  await sendChromeCommand("Page.enable");
  await sendChromeCommand("Runtime.enable");
}

async function createDetachedChromeTargetSession(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pendingCommands = new Map();
  let nextCommandId = 0;

  const rejectPending = (message) => {
    for (const pending of pendingCommands.values()) {
      pending.reject(new Error(message));
    }

    pendingCommands.clear();
  };

  await new Promise((resolve, reject) => {
    const handleOpen = () => {
      socket.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      socket.removeEventListener("open", handleOpen);
      reject(new Error("Failed to connect to the Google Voice Chrome tab."));
    };

    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const data = typeof event.data === "string" ? event.data : event.data.toString();
    const message = JSON.parse(data);

    if (!message.id) {
      return;
    }

    const pending = pendingCommands.get(message.id);
    if (!pending) {
      return;
    }

    pendingCommands.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error.message || "Chrome command failed."));
      return;
    }

    pending.resolve(message.result || {});
  });

  socket.addEventListener("close", () => {
    rejectPending("Google Voice Chrome tab connection closed.");
  });

  socket.addEventListener("error", () => {
    rejectPending("Google Voice Chrome tab connection failed.");
  });

  const sendCommand = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Google Voice Chrome tab is not connected."));
        return;
      }

      const id = ++nextCommandId;
      pendingCommands.set(id, { resolve, reject });

      try {
        socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        pendingCommands.delete(id);
        reject(error);
      }
    });

  const close = () => {
    rejectPending("Google Voice Chrome tab session closed.");

    try {
      socket.close();
    } catch {
      // Ignore close errors for short-lived automation sockets.
    }
  };

  return { sendCommand, close };
}

async function automateGoogleVoiceCallTarget(target) {
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("Google Voice tab did not expose a debugger target.");
  }

  const session = await createDetachedChromeTargetSession(target);

  try {
    await session.sendCommand("Page.bringToFront");
    await delay(GOOGLE_VOICE_AUTOMATION_INITIAL_DELAY_MS);
    await clickGoogleVoiceCallButton(session.sendCommand);
  } finally {
    session.close();
  }
}

function sendChromeCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    if (!chromeState.targetSocket || chromeState.targetSocket.readyState !== WebSocket.OPEN) {
      reject(new Error("Google Chrome is not connected to a page."));
      return;
    }

    const id = ++chromeState.nextCommandId;
    chromeState.pendingCommands.set(id, { resolve, reject });

    try {
      chromeState.targetSocket.send(JSON.stringify({ id, method, params }));
    } catch (error) {
      chromeState.pendingCommands.delete(id);
      reject(error);
    }
  });
}

function normalizeTargetUrl(url) {
  const value = String(url || "").trim();

  if (!value) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value)) {
    return value;
  }

  return `https://${value}`;
}

async function ensureChromeTarget(url = "") {
  const { normalizedUrl } = await ensureChromeTargetSocket(url);
  return pushBrowserState(normalizedUrl ? "open-target" : "connected");
}

async function ensureChromeTargetSocket(url = "") {
  await ensureChromeProcess();
  const normalizedUrl = normalizeTargetUrl(url);
  const targets = await listChromeTargets();
  let target = null;

  if (chromeState.targetId) {
    target =
      targets.find((item) => item.id === chromeState.targetId && item.type === "page") || null;
  }

  if (!target) {
    target = normalizedUrl ? await createChromeTarget(normalizedUrl) : pickChromeTarget(targets);
  }

  if (!target) {
    target = await createChromeTarget(normalizedUrl || "about:blank");
  }

  await connectToChromeTarget(target);

  if (normalizedUrl && target.url !== normalizedUrl) {
    chromeState.currentUrl = normalizedUrl;
    await sendChromeCommand("Page.navigate", { url: normalizedUrl });
  }

  return { normalizedUrl };
}

async function evaluateInChrome(expression) {
  await ensureChromeTargetSocket();

  const response = await sendChromeCommand("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });

  return response?.result?.value;
}

async function readChromePageState() {
  const response = await sendChromeCommand("Runtime.evaluate", {
    expression: `
      (() => ({
        title: document.title,
        url: location.href,
        userAgent: navigator.userAgent,
        readyState: document.readyState
      }))();
    `,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true
  });

  return response?.result?.value || {};
}

async function pushBrowserState(reason) {
  try {
    const pageState = await readChromePageState();
    chromeState.currentUrl = pageState.url || chromeState.currentUrl;
    chromeState.currentTitle = pageState.title || chromeState.currentTitle;
    chromeState.currentUserAgent = pageState.userAgent || chromeState.currentUserAgent;
  } catch {
    // Leave the last known state in place if the page is mid-navigation.
  }

  emitBrowserState(reason);
  return getBrowserSnapshot();
}

async function getBrowserStatus() {
  await findChromeExecutablePath();
  chromeState.profileDir = getChromeProfileDir();

  if (chromeState.targetSocket && chromeState.targetSocket.readyState === WebSocket.OPEN) {
    return pushBrowserState("status");
  }

  return getBrowserSnapshot();
}

function buildTextCheckScript(searchText, caseSensitive) {
  return `
    (() => {
      const needle = ${JSON.stringify(searchText)};
      const useCaseSensitive = ${JSON.stringify(caseSensitive)};
      const normalize = (value) => value.replace(/\\s+/g, " ").trim();
      const body = document.body;
      const root = document.documentElement;
      const visibleText = normalize((body && body.innerText) || "");
      const rawText = normalize((body && body.textContent) || (root && root.textContent) || "");
      const haystacks = [visibleText, rawText].filter(Boolean);
      const searchNeedle = useCaseSensitive ? needle : needle.toLowerCase();
      const found = haystacks.some((haystack) => {
        const source = useCaseSensitive ? haystack : haystack.toLowerCase();
        return source.includes(searchNeedle);
      });
      const previewSource = visibleText || rawText;
      const previewIndex = (() => {
        if (!previewSource) {
          return -1;
        }

        const source = useCaseSensitive ? previewSource : previewSource.toLowerCase();
        return source.indexOf(searchNeedle);
      })();
      const preview =
        previewIndex >= 0
          ? previewSource.slice(
              Math.max(0, previewIndex - 60),
              Math.min(previewSource.length, previewIndex + needle.length + 140)
            )
          : previewSource.slice(0, 200);

      return {
        found,
        preview,
        title: document.title,
        url: location.href
      };
    })();
  `;
}

async function shutdownManagedChrome() {
  const port = chromeState.debuggingPort || CHROME_DEBUGGING_PORT;
  closeChromeTargetSocket("App shutting down.");
  chromeState.process = null;
  await closeChromeBrowser(port);
}

async function waitForDetachedPageLoad(sendCommand) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const response = await sendCommand("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
      awaitPromise: true
    });

    if (response?.result?.value === "complete") {
      return;
    }

    await delay(200);
  }

  throw new Error("Google Voice tab did not finish loading in time.");
}

async function clickGoogleVoiceCallButton(sendCommand) {
  const deadline = Date.now() + 15000;
  let lastError = "Google Voice call button not found.";

  while (Date.now() < deadline) {
    const response = await sendCommand("Runtime.evaluate", {
      expression: `
        (() => {
          const selectors = [
            'button[gv-test-id="dialog-confirm-button"]',
            'button[aria-label="Call"]'
          ];

          const button =
            selectors
              .map((selector) => document.querySelector(selector))
              .find(Boolean) ||
            Array.from(document.querySelectorAll("button")).find((element) => {
              return element.textContent && element.textContent.trim() === "Call";
            });

          if (!button) {
            return { clicked: false, reason: "Call button not found yet." };
          }

          if (button.disabled || button.getAttribute("aria-disabled") === "true") {
            return { clicked: false, reason: "Call button is present but disabled." };
          }

          button.scrollIntoView({ block: "center", inline: "center" });
          button.click();

          return { clicked: true };
        })();
      `,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });

    const result = response?.result?.value;

    if (result?.clicked) {
      return;
    }

    if (result?.reason) {
      lastError = result.reason;
    }

    await delay(GOOGLE_VOICE_AUTOMATION_STEP_DELAY_MS);
  }

  throw new Error(lastError);
}

async function getDetachedPageUrl(sendCommand) {
  const response = await sendCommand("Runtime.evaluate", {
    expression: "location.href",
    returnByValue: true,
    awaitPromise: true
  });

  return typeof response?.result?.value === "string" ? response.result.value : "";
}

function isAcceptableGoogleVoiceUrl(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname === "voice.google.com" && parsed.pathname.includes("/calls");
  } catch {
    return false;
  }
}

async function navigateVoiceTarget(sendCommand, candidateUrls) {
  let lastUrl = "";

  for (const url of candidateUrls) {
    await sendCommand("Page.navigate", { url });
    await waitForDetachedPageLoad(sendCommand);
    lastUrl = await getDetachedPageUrl(sendCommand);

    if (isAcceptableGoogleVoiceUrl(lastUrl)) {
      return lastUrl;
    }
  }

  throw new Error(
    `Google Voice did not open the calls page. Final URL: ${lastUrl || "(unknown)"}`
  );
}

async function dispatchAlert(payload, config) {
  const response = {
    notificationShown: false,
    emailSent: false,
    discordSent: false,
    discordSentCount: 0,
    googleVoiceOpened: false,
    googleVoicePhoneNumber: "",
    googleVoiceUrl: "",
    error: ""
  };
  const errors = [];

  if (Notification.isSupported()) {
    new Notification({
      title: payload.subject,
      body: payload.text
    }).show();
    response.notificationShown = true;
  }

  const deliveryTasks = [];

  if (hasMailConfig(config.smtp)) {
    deliveryTasks.push(
      sendEmailAlert(config.smtp, payload)
        .then(() => {
          response.emailSent = true;
        })
        .catch((error) => {
          errors.push(`email: ${error instanceof Error ? error.message : String(error)}`);
        })
    );
  }

  if (hasDiscordWebhook(config.discordWebhookUrl)) {
    deliveryTasks.push(
      sendDiscordAlertBurst(config, payload)
        .then((sentCount) => {
          response.discordSentCount = sentCount;
          response.discordSent = sentCount > 0;
        })
        .catch((error) => {
          errors.push(`discord: ${error instanceof Error ? error.message : String(error)}`);
        })
    );
  }

  if (hasGoogleVoiceNumber(config.googleVoice)) {
    deliveryTasks.push(
      openGoogleVoiceCallTab(config.googleVoice.phoneNumber)
        .then((googleVoiceResult) => {
          response.googleVoiceOpened = true;
          response.googleVoicePhoneNumber = googleVoiceResult.phoneNumber;
          response.googleVoiceUrl = googleVoiceResult.url;
        })
        .catch((error) => {
          errors.push(`google voice: ${error instanceof Error ? error.message : String(error)}`);
        })
    );
  }

  if (deliveryTasks.length > 0) {
    await Promise.all(deliveryTasks);
  }

  response.error = errors.join("; ");
  return response;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#10131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle("config:load", async () => {
    const config = await readConfig();
    await findChromeExecutablePath();

    return {
      config,
      defaultUserAgent: getCleanUserAgent()
    };
  });

  ipcMain.handle("config:save", async (_event, incomingConfig) => {
    const config = await writeConfig(incomingConfig);
    await findChromeExecutablePath();

    return {
      config,
      defaultUserAgent: getCleanUserAgent()
    };
  });

  ipcMain.handle("alerts:send", async (_event, incoming) => {
    const config = normalizeConfig(incoming?.config || (await readConfig()));
    const payload = incoming?.payload || incoming;
    return dispatchAlert(payload, config);
  });

  ipcMain.handle("browser:get-status", async () => {
    return getBrowserStatus();
  });

  ipcMain.handle("browser:open-target", async (_event, targetUrl) => {
    if (!targetUrl || typeof targetUrl !== "string") {
      throw new Error("Target URL is required.");
    }

    return ensureChromeTarget(targetUrl.trim());
  });

  ipcMain.handle("browser:refresh", async () => {
    await ensureChromeTarget();
    await sendChromeCommand("Page.reload", { ignoreCache: false });
    return pushBrowserState("refresh");
  });

  ipcMain.handle("browser:stop", async () => {
    return stopChromeSession("stopped");
  });

  ipcMain.handle("browser:shutdown", async (_event, reason) => {
    const resolvedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : "chrome-closed";
    return stopChromeSession(resolvedReason, { closeBrowser: true });
  });

  ipcMain.handle("browser:back", async () => {
    await ensureChromeTarget();
    await sendChromeCommand("Runtime.evaluate", {
      expression: "history.back()",
      awaitPromise: true,
      userGesture: true
    });
    return pushBrowserState("back");
  });

  ipcMain.handle("browser:forward", async () => {
    await ensureChromeTarget();
    await sendChromeCommand("Runtime.evaluate", {
      expression: "history.forward()",
      awaitPromise: true,
      userGesture: true
    });
    return pushBrowserState("forward");
  });

  ipcMain.handle("browser:check-text", async (_event, payload) => {
    const searchText = typeof payload?.searchText === "string" ? payload.searchText : "";

    if (!searchText.trim()) {
      throw new Error("Search text is required.");
    }

    return evaluateInChrome(buildTextCheckScript(searchText.trim(), Boolean(payload?.caseSensitive)));
  });

  ipcMain.handle("browser:open-google-voice-call", async (_event, phoneNumber) => {
    return openGoogleVoiceCallTab(phoneNumber);
  });

  ipcMain.handle("gmail:auth-status", async (_event, incomingConfig) => {
    return gmailWatcherService.getAuthStatus(incomingConfig);
  });

  ipcMain.handle("gmail:auth-sign-in", async (_event, incomingConfig) => {
    return gmailWatcherService.signIn(incomingConfig);
  });

  ipcMain.handle("gmail:auth-disconnect", async () => {
    return gmailWatcherService.disconnect();
  });

  ipcMain.handle("gmail:watcher-status", async () => {
    return gmailWatcherService.getSnapshot();
  });

  ipcMain.handle("gmail:watcher-start", async (_event, incomingConfig) => {
    return gmailWatcherService.start(incomingConfig);
  });

  ipcMain.handle("gmail:watcher-stop", async () => {
    return gmailWatcherService.stop("stopped");
  });
}

app.setName(APP_NAME);

app.whenReady().then(() => {
  app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/[^\s]+/, "");
  gmailWatcherService = createGmailWatcherService({
    app,
    readConfig,
    normalizeConfig,
    sendAlert: dispatchAlert,
    emitState: emitGmailWatcherState
  });
  registerIpc();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (gmailWatcherService) {
    gmailWatcherService.dispose();
  }
  void shutdownManagedChrome();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
