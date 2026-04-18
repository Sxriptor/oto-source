const chromeTabButton = document.getElementById("chromeTabButton");
const gmailTabButton = document.getElementById("gmailTabButton");
const chromeTabView = document.getElementById("chromeTabView");
const gmailTabView = document.getElementById("gmailTabView");

const urlInput = document.getElementById("urlInput");
const searchTextInput = document.getElementById("searchTextInput");
const matchModeInput = document.getElementById("matchModeInput");
const caseSensitiveInput = document.getElementById("caseSensitiveInput");
const refreshIntervalInput = document.getElementById("refreshIntervalInput");
const refreshJitterInput = document.getElementById("refreshJitterInput");
const userAgentInput = document.getElementById("userAgentInput");
const scheduleStartInput = document.getElementById("scheduleStartInput");
const scheduleEndInput = document.getElementById("scheduleEndInput");
const smtpHostInput = document.getElementById("smtpHostInput");
const smtpPortInput = document.getElementById("smtpPortInput");
const smtpSecureInput = document.getElementById("smtpSecureInput");
const smtpEnabledInput = document.getElementById("smtpEnabledInput");
const smtpUserInput = document.getElementById("smtpUserInput");
const smtpPassInput = document.getElementById("smtpPassInput");
const smtpFromInput = document.getElementById("smtpFromInput");
const smtpToInput = document.getElementById("smtpToInput");
const discordWebhookInput = document.getElementById("discordWebhookInput");
const discordRepeatCountInput = document.getElementById("discordRepeatCountInput");
const discordRepeatDelayInput = document.getElementById("discordRepeatDelayInput");
const googleVoicePhoneInput = document.getElementById("googleVoicePhoneInput");
const googleVoiceCallButton = document.getElementById("googleVoiceCallButton");
const backButton = document.getElementById("backButton");
const forwardButton = document.getElementById("forwardButton");
const refreshButton = document.getElementById("refreshButton");
const stopButton = document.getElementById("stopButton");
const goButton = document.getElementById("goButton");
const toggleAutoButton = document.getElementById("toggleAutoButton");
const panelToggleBar = document.getElementById("panelToggleBar");
const panelToggleLabel = document.getElementById("panelToggleLabel");
const panelToggleHint = document.getElementById("panelToggleHint");
const controlPanel = document.querySelector("#chromeTabView .control-panel");
const statusBadge = document.getElementById("statusBadge");
const pageTitleLabel = document.getElementById("pageTitleLabel");
const lastCheckLabel = document.getElementById("lastCheckLabel");
const logPanel = document.getElementById("logPanel");
const browserSurfaceTitle = document.getElementById("browserSurfaceTitle");
const browserSurfaceMessage = document.getElementById("browserSurfaceMessage");
const browserSurfaceUrl = document.getElementById("browserSurfaceUrl");
const browserSurfaceProfile = document.getElementById("browserSurfaceProfile");

const gmailClientIdInput = document.getElementById("gmailClientIdInput");
const gmailClientSecretInput = document.getElementById("gmailClientSecretInput");
const gmailSenderInput = document.getElementById("gmailSenderInput");
const gmailSubjectInput = document.getElementById("gmailSubjectInput");
const gmailIntervalInput = document.getElementById("gmailIntervalInput");
const gmailUnreadOnlyInput = document.getElementById("gmailUnreadOnlyInput");
const gmailMarkProcessedInput = document.getElementById("gmailMarkProcessedInput");
const gmailAllowRepeatedInput = document.getElementById("gmailAllowRepeatedInput");
const gmailConnectButton = document.getElementById("gmailConnectButton");
const gmailDisconnectButton = document.getElementById("gmailDisconnectButton");
const gmailStartButton = document.getElementById("gmailStartButton");
const gmailStopButton = document.getElementById("gmailStopButton");
const gmailStatusBadge = document.getElementById("gmailStatusBadge");
const gmailAccountLabel = document.getElementById("gmailAccountLabel");
const gmailLastCheckLabel = document.getElementById("gmailLastCheckLabel");
const gmailLastMatchedLabel = document.getElementById("gmailLastMatchedLabel");
const gmailLastActionLabel = document.getElementById("gmailLastActionLabel");
const gmailQueryLabel = document.getElementById("gmailQueryLabel");
const gmailErrorLabel = document.getElementById("gmailErrorLabel");
const gmailLogPanel = document.getElementById("gmailLogPanel");
const gmailSurfaceTitle = document.getElementById("gmailSurfaceTitle");
const gmailSurfaceMessage = document.getElementById("gmailSurfaceMessage");
const gmailSurfaceRule = document.getElementById("gmailSurfaceRule");
const gmailSurfaceAccount = document.getElementById("gmailSurfaceAccount");

const state = {
  activeTab: "chrome",
  defaultUserAgent: "",
  autoRefreshTimer: null,
  autoRefreshContext: null,
  lastAlertFingerprint: "",
  lastSavedConfig: null,
  pageCheckTimer: null,
  configSaveTimer: null,
  scheduleTimer: null,
  scheduleWasActive: false,
  pendingScheduledGo: false,
  hasOpenPage: false,
  panelCollapsed: false,
  browserStatus: null,
  gmailWatcher: null,
  unsubscribeBrowserEvents: null,
  unsubscribeGmailEvents: null
};

function log(message, target = "chrome") {
  const panel = target === "gmail" ? gmailLogPanel : logPanel;
  const row = document.createElement("div");
  row.className = "log-line";
  row.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  panel.prepend(row);

  while (panel.childElementCount > 120) {
    panel.removeChild(panel.lastElementChild);
  }
}

function setStatus(label, tone) {
  statusBadge.textContent = label;
  statusBadge.className = `status-badge ${tone}`;
}

function setGmailBadge(label, tone) {
  gmailStatusBadge.textContent = label;
  gmailStatusBadge.className = `status-badge ${tone}`;
}

function syncControlPanel() {
  panelToggleBar.hidden = !state.hasOpenPage;
  controlPanel.classList.toggle("has-open-page", state.hasOpenPage);
  controlPanel.classList.toggle("collapsed", state.hasOpenPage && state.panelCollapsed);
  panelToggleBar.setAttribute("aria-expanded", String(!state.panelCollapsed));
  panelToggleLabel.textContent = state.panelCollapsed ? "Show Controls" : "Hide Controls";
  panelToggleHint.textContent = state.panelCollapsed ? "Click to reopen settings" : "Click to collapse";
}

function setPanelCollapsed(nextCollapsed) {
  state.panelCollapsed = Boolean(nextCollapsed && state.hasOpenPage);
  syncControlPanel();
}

function updatePageOpenState(url, options = {}) {
  const { collapseOnFirstOpen = false, forceCollapse = false, pageOpen = null } = options;
  const wasOpen = state.hasOpenPage;
  state.hasOpenPage =
    typeof pageOpen === "boolean" ? pageOpen : Boolean(url && url !== "about:blank");

  if (!state.hasOpenPage) {
    state.panelCollapsed = false;
  } else if (forceCollapse || (!wasOpen && collapseOnFirstOpen)) {
    state.panelCollapsed = true;
  }

  syncControlPanel();
}

function populateForm(config) {
  urlInput.value = config.targetUrl || "";
  searchTextInput.value = config.searchText || "";
  matchModeInput.value = config.matchMode || "contains";
  caseSensitiveInput.checked = Boolean(config.caseSensitive);
  refreshIntervalInput.value = String(config.refreshIntervalSeconds || 30);
  refreshJitterInput.value = String(config.refreshJitterSeconds ?? 10);
  userAgentInput.value = config.customUserAgent || "";
  scheduleStartInput.value = config.scheduleStartTime || "";
  scheduleEndInput.value = config.scheduleEndTime || "";
  discordWebhookInput.value = config.discordWebhookUrl || "";
  discordRepeatCountInput.value = String(config.discordRepeatCount || 5);
  discordRepeatDelayInput.value = String(config.discordRepeatDelaySeconds ?? 5);
  googleVoicePhoneInput.value = config.googleVoice?.phoneNumber || "";
  smtpEnabledInput.checked = Boolean(config.smtp?.enabled);
  smtpHostInput.value = config.smtp.host || "";
  smtpPortInput.value = String(config.smtp.port || 587);
  smtpSecureInput.checked = Boolean(config.smtp.secure);
  smtpUserInput.value = config.smtp.user || "";
  smtpPassInput.value = config.smtp.pass || "";
  smtpFromInput.value = config.smtp.from || "";
  smtpToInput.value = config.smtp.to || "";
  gmailClientIdInput.value = config.gmailWatcher?.clientId || "";
  gmailClientSecretInput.value = config.gmailWatcher?.clientSecret || "";
  gmailSenderInput.value = config.gmailWatcher?.sender || "";
  gmailSubjectInput.value = config.gmailWatcher?.subjectContains || "";
  gmailIntervalInput.value = String(config.gmailWatcher?.checkIntervalSeconds || 30);
  gmailUnreadOnlyInput.checked = Boolean(config.gmailWatcher?.onlyUnread);
  gmailMarkProcessedInput.checked = Boolean(config.gmailWatcher?.markAsProcessed);
  gmailAllowRepeatedInput.checked = Boolean(config.gmailWatcher?.allowRepeatedAlerts);
  updateGmailSurfaceRule(config.gmailWatcher || {});
}

function readFormConfig() {
  return {
    targetUrl: urlInput.value.trim(),
    searchText: searchTextInput.value.trim(),
    matchMode: matchModeInput.value,
    caseSensitive: caseSensitiveInput.checked,
    refreshIntervalSeconds: Number(refreshIntervalInput.value) || 30,
    refreshJitterSeconds: refreshJitterInput.value === "" ? 10 : Number(refreshJitterInput.value),
    customUserAgent: userAgentInput.value.trim(),
    scheduleStartTime: scheduleStartInput.value,
    scheduleEndTime: scheduleEndInput.value,
    discordWebhookUrl: discordWebhookInput.value.trim(),
    discordRepeatCount: Number(discordRepeatCountInput.value) || 5,
    discordRepeatDelaySeconds:
      discordRepeatDelayInput.value === "" ? 5 : Number(discordRepeatDelayInput.value),
    googleVoice: {
      phoneNumber: googleVoicePhoneInput.value.trim()
    },
    gmailWatcher: {
      clientId: gmailClientIdInput.value.trim(),
      clientSecret: gmailClientSecretInput.value.trim(),
      sender: gmailSenderInput.value.trim(),
      subjectContains: gmailSubjectInput.value.trim(),
      checkIntervalSeconds: Number(gmailIntervalInput.value) || 30,
      onlyUnread: gmailUnreadOnlyInput.checked,
      markAsProcessed: gmailMarkProcessedInput.checked,
      allowRepeatedAlerts: gmailAllowRepeatedInput.checked
    },
    smtp: {
      enabled: smtpEnabledInput.checked,
      host: smtpHostInput.value.trim(),
      port: Number(smtpPortInput.value) || 587,
      secure: smtpSecureInput.checked,
      user: smtpUserInput.value.trim(),
      pass: smtpPassInput.value,
      from: smtpFromInput.value.trim(),
      to: smtpToInput.value.trim()
    }
  };
}

async function saveConfig(options = {}) {
  const { repopulateForm = false } = options;
  const response = await window.monitorApi.saveConfig(readFormConfig());
  state.defaultUserAgent = response.defaultUserAgent;
  state.lastSavedConfig = response.config;

  if (repopulateForm) {
    populateForm(response.config);
  }

  return response.config;
}

function scheduleConfigSave() {
  window.clearTimeout(state.configSaveTimer);
  state.configSaveTimer = window.setTimeout(() => {
    state.configSaveTimer = null;
    void saveConfig().catch((error) => {
      log(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`);
      log(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`, "gmail");
    });
  }, 300);
}

function saveConfigNow() {
  window.clearTimeout(state.configSaveTimer);
  state.configSaveTimer = null;
  void saveConfig().catch((error) => {
    log(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`);
    log(`Settings save failed: ${error instanceof Error ? error.message : String(error)}`, "gmail");
  });
}

function updateAutoRefreshButton() {
  toggleAutoButton.textContent = state.autoRefreshTimer ? "Stop Auto Refresh" : "Start Auto Refresh";
}

function stopAutoRefresh() {
  if (state.autoRefreshTimer) {
    window.clearTimeout(state.autoRefreshTimer);
    state.autoRefreshTimer = null;
    state.autoRefreshContext = null;
    updateAutoRefreshButton();
    log("Auto refresh stopped.");
  }
}

function getUrlOrigin(value) {
  const url = String(value || "").trim();
  if (!url) {
    return "";
  }

  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function isUrlMismatch(expectedUrl, actualUrl) {
  const expectedOrigin = getUrlOrigin(expectedUrl);
  const actualOrigin = getUrlOrigin(actualUrl);

  if (expectedOrigin && actualOrigin) {
    return expectedOrigin !== actualOrigin;
  }

  if (expectedUrl && actualUrl) {
    return expectedUrl !== actualUrl;
  }

  return false;
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) {
    return raw;
  }

  return `https://${raw}`;
}

function syncNavigationButtons() {
  const pageOpen = Boolean(state.browserStatus?.pageOpen);
  backButton.disabled = !pageOpen;
  forwardButton.disabled = !pageOpen;
  refreshButton.disabled = !pageOpen;
  stopButton.disabled = !pageOpen;
  googleVoiceCallButton.disabled = !state.browserStatus?.chromeAvailable;
}

function applyBrowserStatus(browser, options = {}) {
  const { collapseOnFirstOpen = false } = options;
  state.browserStatus = browser;
  updatePageOpenState(browser?.url || "", { collapseOnFirstOpen, pageOpen: Boolean(browser?.pageOpen) });

  if (!browser?.chromeAvailable) {
    browserSurfaceTitle.textContent = "Google Chrome not found";
    browserSurfaceMessage.textContent =
      "Install Google Chrome to use the real-browser monitoring mode.";
    browserSurfaceUrl.textContent = "No Chrome path detected.";
    browserSurfaceProfile.textContent = "";
    pageTitleLabel.textContent = "Google Chrome not available";
    setStatus("Chrome Missing", "error");
    syncNavigationButtons();
    return;
  }

  browserSurfaceTitle.textContent = browser.pageOpen
    ? browser.title || "Google Chrome page open"
    : "Google Chrome controller";
  browserSurfaceMessage.textContent = browser.pageOpen
    ? "This app is monitoring a real Google Chrome window with its own persistent profile."
    : "Click `Go` to open a real Google Chrome window with a stable profile and session for this app.";
  browserSurfaceUrl.textContent = browser.pageOpen
    ? `Active page: ${browser.url}`
    : "No Chrome page open yet.";
  browserSurfaceProfile.textContent = `Profile: ${browser.profileDir}`;
  pageTitleLabel.textContent = browser.title || browser.url || "No page loaded";

  if (!browser.pageOpen && statusBadge.textContent === "Idle") {
    setStatus("Idle", "idle");
  }

  syncNavigationButtons();
}

function updateGmailSurfaceRule(gmailConfig) {
  const sender = gmailConfig.sender || "any sender";
  const subject = gmailConfig.subjectContains || "any subject";
  gmailSurfaceRule.textContent = `Rule: sender "${sender}" | subject contains "${subject}"`;
}

function applyGmailWatcherStatus(watcher) {
  state.gmailWatcher = watcher;

  if (!watcher) {
    setGmailBadge("Idle", "idle");
    gmailAccountLabel.textContent = "Gmail not connected";
    gmailLastCheckLabel.textContent = "No Gmail checks yet";
    gmailLastMatchedLabel.textContent = "No match yet";
    gmailLastActionLabel.textContent = "No action yet";
    gmailQueryLabel.textContent = "No active query";
    gmailErrorLabel.textContent = "No errors";
    gmailSurfaceTitle.textContent = "Ready to monitor Gmail";
    gmailSurfaceMessage.textContent =
      "Connect a Gmail account, define the sender + subject rule, then start the watcher.";
    gmailSurfaceAccount.textContent = "Account: not connected.";
    gmailDisconnectButton.disabled = true;
    gmailStopButton.disabled = true;
    gmailStartButton.disabled = false;
    return;
  }

  const toneByStatus = {
    idle: "idle",
    running: "loading",
    matched: "ready",
    error: "error"
  };
  const labelByStatus = {
    idle: "Idle",
    running: "Running",
    matched: "Matched",
    error: "Error"
  };

  setGmailBadge(labelByStatus[watcher.status] || "Idle", toneByStatus[watcher.status] || "idle");
  gmailAccountLabel.textContent = watcher.connectedEmail
    ? `Connected Gmail account: ${watcher.connectedEmail}`
    : "Gmail not connected";
  gmailLastCheckLabel.textContent = watcher.lastCheckAt
    ? `Last Gmail check: ${watcher.lastCheckAt}`
    : "No Gmail checks yet";
  gmailLastMatchedLabel.textContent = watcher.lastMatchedEmail || "No match yet";
  gmailLastActionLabel.textContent = watcher.lastActionTriggered || "No action yet";
  gmailQueryLabel.textContent = watcher.query || "No active query";
  gmailErrorLabel.textContent = watcher.lastError || "No errors";
  gmailSurfaceTitle.textContent = watcher.running ? "Gmail watcher is active" : "Ready to monitor Gmail";
  gmailSurfaceMessage.textContent = watcher.lastError
    ? watcher.lastError
    : watcher.running
      ? "Watching Gmail on the selected interval and bridging matches into the current alert flow."
      : "Connect a Gmail account, define the sender + subject rule, then start the watcher.";
  gmailSurfaceAccount.textContent = watcher.connectedEmail
    ? `Account: ${watcher.connectedEmail}`
    : "Account: not connected.";
  gmailDisconnectButton.disabled = !watcher.connectedEmail;
  gmailStopButton.disabled = !watcher.running;
  gmailStartButton.disabled = watcher.running || watcher.authInProgress;
  gmailConnectButton.disabled = watcher.authInProgress;
}

function setActiveTab(nextTab) {
  state.activeTab = nextTab === "gmail" ? "gmail" : "chrome";
  const gmailActive = state.activeTab === "gmail";

  chromeTabButton.classList.toggle("active", !gmailActive);
  gmailTabButton.classList.toggle("active", gmailActive);
  chromeTabView.hidden = gmailActive;
  gmailTabView.hidden = !gmailActive;
}

async function stopBrowser() {
  if (!state.browserStatus?.pageOpen) {
    return;
  }

  stopAutoRefresh();
  window.clearTimeout(state.pageCheckTimer);
  state.pageCheckTimer = null;

  setStatus("Stopping", "loading");
  log("Stopping Chrome session.");

  try {
    const browser = await window.monitorApi.stopBrowser();
    applyBrowserStatus(browser);
    setStatus("Idle", "idle");
    log("Chrome session stopped.");
  } catch (error) {
    setStatus("Stop Failed", "error");
    log(`Stop failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function refreshPage(reason = "manual") {
  await saveConfig({ repopulateForm: true });

  if (!state.browserStatus?.pageOpen) {
    log("Open a page in Google Chrome before refreshing.");
    return;
  }

  try {
    setStatus("Refreshing", "loading");
    await window.monitorApi.refreshBrowser();
    log(`Refresh triggered (${reason}).`);
  } catch (error) {
    setStatus("Refresh Failed", "error");
    log(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function startAutoRefresh() {
  const config = await saveConfig({ repopulateForm: true });
  const intervalSeconds = Math.max(1, Number(config.refreshIntervalSeconds) || 30);
  const jitterSecondsRaw = Number(config.refreshJitterSeconds);
  const jitterSeconds = Number.isFinite(jitterSecondsRaw) ? Math.max(0, Math.min(10, jitterSecondsRaw)) : 10;
  const expectedUrl = normalizeUrl(config.targetUrl || state.browserStatus?.url || "");
  stopAutoRefresh();

  state.autoRefreshContext = { intervalSeconds, jitterSeconds, expectedUrl };

  const scheduleNext = () => {
    if (!state.autoRefreshContext) {
      return;
    }

    const { intervalSeconds: base, jitterSeconds: jitter } = state.autoRefreshContext;
    const jitterDelta = jitter > 0 ? Math.floor(Math.random() * (jitter * 2 + 1)) - jitter : 0;
    const delaySeconds = Math.max(1, base + jitterDelta);

    state.autoRefreshTimer = window.setTimeout(() => {
      void refreshPage("auto");
      scheduleNext();
    }, delaySeconds * 1000);
  };

  scheduleNext();

  updateAutoRefreshButton();
  log(`Auto refresh started at ~${intervalSeconds}s intervals (jitter +/-${jitterSeconds}s).`);
}

function schedulePageCheck() {
  window.clearTimeout(state.pageCheckTimer);
  state.pageCheckTimer = window.setTimeout(() => {
    void checkPageText();
  }, 1000);
}

async function checkPageText() {
  const config = readFormConfig();
  const searchText = config.searchText;
  const shouldNotifyWhenFound = config.matchMode === "contains";
  const checkedAt = new Date().toLocaleTimeString();
  lastCheckLabel.textContent = `Last page text check: ${checkedAt}`;

  if (!searchText) {
    state.lastAlertFingerprint = "";
    log("Skipped page text check because no search text is configured.");
    return;
  }

  if (!state.browserStatus?.pageOpen) {
    log("Skipped page text check because no Chrome page is open yet.");
    return;
  }

  try {
    const result = await window.monitorApi.checkPageText({
      searchText,
      caseSensitive: config.caseSensitive
    });

    pageTitleLabel.textContent =
      result.title || state.browserStatus.title || state.browserStatus.url || "Page loaded";

    const conditionMatched = shouldNotifyWhenFound ? result.found : !result.found;
    const modeLabel = shouldNotifyWhenFound ? "found" : "missing";

    if (!conditionMatched) {
      state.lastAlertFingerprint = "";
      log(`Text check did not match. Looking for "${searchText}" to be ${modeLabel}.`);
      return;
    }

    const fingerprint = [
      config.matchMode,
      config.caseSensitive ? "case" : "nocase",
      searchText,
      result.url
    ].join("|");

    if (fingerprint === state.lastAlertFingerprint) {
      log(`Text condition still matched for "${searchText}".`);
      return;
    }

    state.lastAlertFingerprint = fingerprint;
    const summary = result.preview || "No preview text available.";
    const outcomeLabel = shouldNotifyWhenFound ? "found" : "missing";
    const payload = {
      subject: `Text ${outcomeLabel} on ${result.title || result.url}`,
      text:
        `Search text: ${searchText}\n` +
        `Rule: notify when text is ${outcomeLabel}\n` +
        `Case-sensitive: ${config.caseSensitive ? "yes" : "no"}\n` +
        `URL: ${result.url}\n\n` +
        `Preview:\n${summary}`
    };

    const alertResponse = await window.monitorApi.sendAlert(payload, readFormConfig());
    const deliveryChannels = ["desktop notification"];

    if (alertResponse.emailSent) {
      deliveryChannels.push("email");
    }

    if (alertResponse.discordSent) {
      deliveryChannels.push(`Discord x${alertResponse.discordSentCount || 1}`);
    }

    if (alertResponse.googleVoiceOpened) {
      deliveryChannels.push(`Google Voice ${alertResponse.googleVoicePhoneNumber}`);
    }

    const delivery = alertResponse.error
      ? `${deliveryChannels.join(" + ")}, errors: ${alertResponse.error}`
      : deliveryChannels.join(" + ");

    log(`Text ${outcomeLabel}: "${searchText}" (${delivery}).`);
  } catch (error) {
    log(`Page text check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadTargetUrl() {
  const config = await saveConfig({ repopulateForm: true });
  const targetUrl = config.targetUrl;

  if (!targetUrl) {
    log("Enter a URL before loading the page.");
    return;
  }

  updatePageOpenState(targetUrl, { forceCollapse: true });
  setStatus("Opening Chrome", "loading");
  log(`Opening Google Chrome at ${targetUrl}`);

  try {
    const browser = await window.monitorApi.openTarget(targetUrl);
    applyBrowserStatus(browser, { collapseOnFirstOpen: true });
  } catch (error) {
    if (state.pendingScheduledGo) {
      state.pendingScheduledGo = false;
    }
    updatePageOpenState("", {});
    setStatus("Load Failed", "error");
    log(`Failed to open Google Chrome: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseTimeValue(value) {
  const time = String(value || "").trim();
  if (!time) {
    return null;
  }

  const match = time.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function isNowInScheduleWindow(startMinutes, endMinutes) {
  if (startMinutes == null || endMinutes == null) {
    return false;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes === endMinutes) {
    return false;
  }

  if (endMinutes > startMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

async function shutdownForUrlChange(expectedUrl, actualUrl) {
  stopAutoRefresh();
  window.clearTimeout(state.pageCheckTimer);
  state.pageCheckTimer = null;
  state.pendingScheduledGo = false;

  setStatus("Stopped", "error");
  log(`URL changed during auto refresh. Expected ${expectedUrl || "(unknown)"} but saw ${actualUrl}. Closing Chrome.`);

  try {
    await window.monitorApi.shutdownBrowser("url-changed");
  } catch (error) {
    log(`Shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function evaluateScheduleTick() {
  const config = readFormConfig();
  const startMinutes = parseTimeValue(config.scheduleStartTime);
  const endMinutes = parseTimeValue(config.scheduleEndTime);
  const enabled = startMinutes != null && endMinutes != null;
  const active = enabled && isNowInScheduleWindow(startMinutes, endMinutes);

  if (active && !state.scheduleWasActive) {
    state.scheduleWasActive = true;
    log(`Schedule window started (${config.scheduleStartTime} -> ${config.scheduleEndTime}).`);

    if (state.browserStatus?.pageOpen) {
      if (!state.autoRefreshTimer) {
        void startAutoRefresh();
      }
    } else {
      state.pendingScheduledGo = true;
      void loadTargetUrl();
    }
  } else if (!active && state.scheduleWasActive) {
    state.scheduleWasActive = false;
    state.pendingScheduledGo = false;
    stopAutoRefresh();
    log(`Schedule window ended (${config.scheduleStartTime} -> ${config.scheduleEndTime}).`);
  } else if (!enabled) {
    state.scheduleWasActive = false;
    state.pendingScheduledGo = false;
  }

  state.scheduleTimer = window.setTimeout(() => evaluateScheduleTick(), 30 * 1000);
}

async function openGoogleVoiceCall() {
  const config = await saveConfig({ repopulateForm: true });
  const phoneNumber = config.googleVoice?.phoneNumber || "";

  if (!phoneNumber) {
    log("Enter a Google Voice phone number before opening a call tab.");
    return;
  }

  log(`Opening Google Voice for ${phoneNumber} in a new Chrome tab.`);

  try {
    const result = await window.monitorApi.openGoogleVoiceCall(phoneNumber);
    log(`Google Voice tab opened for ${result.phoneNumber}.`);
  } catch (error) {
    log(`Google Voice open failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function connectGmail() {
  const config = await saveConfig({ repopulateForm: true });
  log("Starting Gmail sign-in flow.", "gmail");

  try {
    const watcher = await window.monitorApi.gmailSignIn(config);
    applyGmailWatcherStatus(watcher);
    log(`Gmail connected${watcher.connectedEmail ? `: ${watcher.connectedEmail}` : "."}`, "gmail");
  } catch (error) {
    log(`Gmail sign-in failed: ${error instanceof Error ? error.message : String(error)}`, "gmail");
  }
}

async function disconnectGmail() {
  try {
    const watcher = await window.monitorApi.gmailDisconnect();
    applyGmailWatcherStatus(watcher);
    log("Gmail connection removed.", "gmail");
  } catch (error) {
    log(`Failed to disconnect Gmail: ${error instanceof Error ? error.message : String(error)}`, "gmail");
  }
}

async function startGmailWatcher() {
  const config = await saveConfig({ repopulateForm: true });
  updateGmailSurfaceRule(config.gmailWatcher || {});
  log("Starting Gmail watcher.", "gmail");

  try {
    const watcher = await window.monitorApi.startGmailWatcher(config);
    applyGmailWatcherStatus(watcher);
    log(`Watching Gmail every ${config.gmailWatcher.checkIntervalSeconds}s.`, "gmail");
  } catch (error) {
    log(`Gmail watcher failed to start: ${error instanceof Error ? error.message : String(error)}`, "gmail");
  }
}

async function stopGmailWatcher() {
  try {
    const watcher = await window.monitorApi.stopGmailWatcher();
    applyGmailWatcherStatus(watcher);
    log("Gmail watcher stopped.", "gmail");
  } catch (error) {
    log(`Failed to stop Gmail watcher: ${error instanceof Error ? error.message : String(error)}`, "gmail");
  }
}

async function boot() {
  const response = await window.monitorApi.loadConfig();
  state.defaultUserAgent = response.defaultUserAgent;
  state.lastSavedConfig = response.config;
  populateForm(response.config);
  updateAutoRefreshButton();
  syncControlPanel();
  setActiveTab("chrome");

  userAgentInput.disabled = true;
  userAgentInput.title = "Real Google Chrome mode uses Google Chrome's own user agent.";

  state.unsubscribeBrowserEvents = window.monitorApi.onBrowserEvent((event) => {
    if (event.type !== "browser-state") {
      return;
    }

    applyBrowserStatus(event.browser, { collapseOnFirstOpen: true });

    if (
      state.autoRefreshContext &&
      state.autoRefreshTimer &&
      event.browser?.url &&
      isUrlMismatch(state.autoRefreshContext.expectedUrl, event.browser.url)
    ) {
      void shutdownForUrlChange(state.autoRefreshContext.expectedUrl, event.browser.url);
      return;
    }

    if (event.reason === "page-loaded") {
      setStatus("Loaded", "ready");
      schedulePageCheck();

      if (state.pendingScheduledGo) {
        state.pendingScheduledGo = false;
        if (!state.autoRefreshTimer) {
          void startAutoRefresh();
        }
      }
    } else if (event.reason === "stopped") {
      setStatus("Idle", "idle");
    } else if (event.reason === "page-closed" || event.reason === "chrome-closed") {
      setStatus("Disconnected", "error");
    } else if (event.reason === "url-changed") {
      setStatus("Stopped", "error");
    } else if (
      event.reason === "chrome-started" ||
      event.reason === "open-target" ||
      event.reason === "refresh"
    ) {
      setStatus("Loading", "loading");
      schedulePageCheck();
    } else if (event.reason === "page-navigated") {
      setStatus("Loading", "loading");
      schedulePageCheck();
    }
  });

  state.unsubscribeGmailEvents = window.monitorApi.onGmailWatcherEvent((event) => {
    if (event.type !== "gmail-watcher-state") {
      return;
    }

    applyGmailWatcherStatus(event.watcher);

    if (event.reason === "matched") {
      log(`Matched email: ${event.watcher.lastMatchedEmail}`, "gmail");
    } else if (event.reason === "error" && event.watcher.lastError) {
      log(`Gmail watcher error: ${event.watcher.lastError}`, "gmail");
    }
  });

  const [browser, gmailWatcher, gmailAuth] = await Promise.all([
    window.monitorApi.getBrowserStatus(),
    window.monitorApi.getGmailWatcherStatus(),
    window.monitorApi.getGmailAuthStatus(response.config)
  ]);

  applyBrowserStatus(browser);
  applyGmailWatcherStatus(gmailWatcher.connected ? gmailWatcher : gmailAuth);

  window.clearTimeout(state.scheduleTimer);
  state.scheduleTimer = null;
  state.scheduleWasActive = false;
  evaluateScheduleTick();

  if (response.config.targetUrl) {
    log(`Saved URL ready: ${response.config.targetUrl} (click Go to open).`);
  } else {
    log("Configured the app. Click Go to open a real Google Chrome window with this app's persistent profile.");
  }

  log("Gmail watcher ready. Add OAuth credentials, sign in, and start monitoring.", "gmail");
}

chromeTabButton.addEventListener("click", () => {
  setActiveTab("chrome");
});

gmailTabButton.addEventListener("click", () => {
  setActiveTab("gmail");
});

backButton.addEventListener("click", () => {
  if (!state.browserStatus?.pageOpen) {
    return;
  }

  setStatus("Navigating", "loading");
  void window.monitorApi.goBack().catch((error) => {
    setStatus("Back Failed", "error");
    log(`Back failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});

forwardButton.addEventListener("click", () => {
  if (!state.browserStatus?.pageOpen) {
    return;
  }

  setStatus("Navigating", "loading");
  void window.monitorApi.goForward().catch((error) => {
    setStatus("Forward Failed", "error");
    log(`Forward failed: ${error instanceof Error ? error.message : String(error)}`);
  });
});

refreshButton.addEventListener("click", () => {
  void refreshPage();
});

stopButton.addEventListener("click", () => {
  void stopBrowser();
});

goButton.addEventListener("click", () => {
  void loadTargetUrl();
});

googleVoiceCallButton.addEventListener("click", () => {
  void openGoogleVoiceCall();
});

toggleAutoButton.addEventListener("click", () => {
  if (state.autoRefreshTimer) {
    stopAutoRefresh();
  } else {
    void startAutoRefresh();
  }
});

panelToggleBar.addEventListener("click", () => {
  setPanelCollapsed(!state.panelCollapsed);
});

urlInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    void loadTargetUrl();
  }
});

gmailConnectButton.addEventListener("click", () => {
  void connectGmail();
});

gmailDisconnectButton.addEventListener("click", () => {
  void disconnectGmail();
});

gmailStartButton.addEventListener("click", () => {
  void startGmailWatcher();
});

gmailStopButton.addEventListener("click", () => {
  void stopGmailWatcher();
});

const settingsFields = document.querySelectorAll("input, select");
for (const field of settingsFields) {
  field.addEventListener("input", () => {
    scheduleConfigSave();
  });

  field.addEventListener("change", () => {
    saveConfigNow();
  });
}

window.addEventListener("beforeunload", () => {
  window.clearTimeout(state.configSaveTimer);
  window.clearTimeout(state.pageCheckTimer);
  window.clearTimeout(state.scheduleTimer);

  if (state.unsubscribeBrowserEvents) {
    state.unsubscribeBrowserEvents();
  }

  if (state.unsubscribeGmailEvents) {
    state.unsubscribeGmailEvents();
  }

  stopAutoRefresh();
});

void boot();
