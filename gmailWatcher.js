const { BrowserWindow, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { google } = require("googleapis");

const AUTH_TIMEOUT_MS = 2 * 60 * 1000;
const AUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];

function createGmailWatcherService({
  app,
  BrowserWindowClass = BrowserWindow,
  readConfig,
  normalizeConfig,
  sendAlert,
  emitState
}) {
  const state = {
    running: false,
    timer: null,
    startedAtMs: 0,
    processedMessageIds: new Set(),
    persistedProcessedMessageIds: new Set(),
    currentConfig: null,
    connectedEmail: "",
    authInProgress: false,
    status: "idle",
    query: "",
    lastCheckAt: "",
    lastMatchedEmail: "",
    lastActionTriggered: "",
    lastError: ""
  };
  const MATCH_FRESHNESS_GRACE_MS = 5000;

  function getTokenPath() {
    return path.join(app.getPath("userData"), "gmail-oauth.json");
  }

  function getProcessedCachePath() {
    return path.join(app.getPath("userData"), "gmail-processed.json");
  }

  function getWatcherConfig(config) {
    return normalizeConfig(config).gmailWatcher;
  }

  function buildSnapshot() {
    return {
      type: "gmail-watcher",
      running: state.running,
      authInProgress: state.authInProgress,
      connected: Boolean(state.connectedEmail),
      connectedEmail: state.connectedEmail,
      status: state.status,
      query: state.query,
      lastCheckAt: state.lastCheckAt,
      lastMatchedEmail: state.lastMatchedEmail,
      lastActionTriggered: state.lastActionTriggered,
      lastError: state.lastError
    };
  }

  function pushState(reason) {
    emitState({
      type: "gmail-watcher-state",
      reason,
      watcher: buildSnapshot()
    });
    return buildSnapshot();
  }

  async function readTokenFile() {
    try {
      const raw = await fs.readFile(getTokenPath(), "utf8");
      const parsed = JSON.parse(raw);
      return {
        tokens: parsed?.tokens && typeof parsed.tokens === "object" ? parsed.tokens : parsed,
        connectedEmail:
          typeof parsed?.connectedEmail === "string" ? parsed.connectedEmail.trim() : ""
      };
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async function writeTokenFile(tokenPayload) {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(getTokenPath(), JSON.stringify(tokenPayload, null, 2), "utf8");
  }

  async function deleteTokenFile() {
    try {
      await fs.unlink(getTokenPath());
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  async function loadProcessedCache() {
    try {
      const raw = await fs.readFile(getProcessedCachePath(), "utf8");
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed?.messageIds) ? parsed.messageIds : [];
      state.persistedProcessedMessageIds = new Set(
        values.filter((value) => typeof value === "string" && value.trim())
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        state.persistedProcessedMessageIds = new Set();
        return;
      }

      throw error;
    }
  }

  async function saveProcessedCache() {
    await fs.mkdir(app.getPath("userData"), { recursive: true });
    await fs.writeFile(
      getProcessedCachePath(),
      JSON.stringify({ messageIds: Array.from(state.persistedProcessedMessageIds) }, null, 2),
      "utf8"
    );
  }

  function requireOAuthConfig(config) {
    const gmailConfig = getWatcherConfig(config);

    if (!gmailConfig.clientId || !gmailConfig.clientSecret) {
      throw new Error("Enter a Gmail OAuth client ID and client secret before signing in.");
    }

    return gmailConfig;
  }

  function createOAuthClient(config, redirectUri = "http://127.0.0.1") {
    const gmailConfig = requireOAuthConfig(config);
    return new google.auth.OAuth2(gmailConfig.clientId, gmailConfig.clientSecret, redirectUri);
  }

  async function getAuthorizedClient(config) {
    const tokenPayload = await readTokenFile();

    if (!tokenPayload?.tokens) {
      throw new Error("Gmail is not connected. Sign in first.");
    }

    const client = createOAuthClient(config);
    client.setCredentials(tokenPayload.tokens);
    state.connectedEmail = tokenPayload.connectedEmail || state.connectedEmail;

    client.on("tokens", (tokens) => {
      const mergedTokens = {
        ...tokenPayload.tokens,
        ...tokens
      };

      void writeTokenFile({
        tokens: mergedTokens,
        connectedEmail: state.connectedEmail
      });
    });

    return client;
  }

  async function fetchConnectedEmail(auth) {
    const oauth2 = google.oauth2({ version: "v2", auth });
    const response = await oauth2.userinfo.get();
    return typeof response.data?.email === "string" ? response.data.email.trim() : "";
  }

  async function getAuthStatus(incomingConfig) {
    const config = normalizeConfig(incomingConfig || (await readConfig()));
    const tokenPayload = await readTokenFile();
    state.connectedEmail = tokenPayload?.connectedEmail || state.connectedEmail;

    if (!tokenPayload?.tokens) {
      state.connectedEmail = "";
      return pushState("auth-missing");
    }

    try {
      const auth = await getAuthorizedClient(config);
      const email = await fetchConnectedEmail(auth);
      state.connectedEmail = email || state.connectedEmail;

      await writeTokenFile({
        tokens: auth.credentials,
        connectedEmail: state.connectedEmail
      });

      return pushState("auth-status");
    } catch (error) {
      state.connectedEmail = "";
      state.lastError = error instanceof Error ? error.message : String(error);
      return pushState("auth-error");
    }
  }

  async function runOAuthFlow(config) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeoutId = null;
      let server = null;
      let authWindow = null;

      const finish = (callback) => {
        if (settled) {
          return;
        }

        settled = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (server) {
          server.close();
        }

        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close();
        }

        callback();
      };

      server = http.createServer(async (request, response) => {
        try {
          const requestUrl = new URL(request.url || "/", "http://127.0.0.1");

          if (requestUrl.pathname !== "/oauth2callback") {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
          }

          const code = requestUrl.searchParams.get("code");
          const receivedState = requestUrl.searchParams.get("state");

          if (!code || receivedState !== oauthState) {
            response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Gmail sign-in failed. You can close this window.");
            finish(() => reject(new Error("Gmail sign-in was cancelled or returned an invalid response.")));
            return;
          }

          const tokenResponse = await authClient.getToken(code);
          authClient.setCredentials(tokenResponse.tokens);
          const email = await fetchConnectedEmail(authClient);

          response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          response.end(
            "<!doctype html><title>OTO Gmail Connected</title><body style=\"font-family:Segoe UI,sans-serif;padding:24px;background:#10131a;color:#edf2ff;\">Gmail connected. You can close this window and return to OTO.</body>"
          );

          finish(() =>
            resolve({
              tokens: authClient.credentials,
              connectedEmail: email
            })
          );
        } catch (error) {
          try {
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Gmail sign-in failed. Return to OTO.");
          } catch {
            // Ignore response write failures if the browser closed early.
          }

          finish(() => reject(error));
        }
      });

      server.listen(0, "127.0.0.1", async () => {
        try {
          const address = server.address();
          const port = typeof address === "object" && address ? address.port : 0;
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
          authClient = createOAuthClient(config, redirectUri);
          oauthState = crypto.randomUUID();

          const authUrl = authClient.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: AUTH_SCOPES,
            state: oauthState
          });

          timeoutId = setTimeout(() => {
            finish(() => reject(new Error("Gmail sign-in timed out.")));
          }, AUTH_TIMEOUT_MS);

          if (process.platform === "win32") {
            await shell.openExternal(authUrl);
          } else {
            authWindow = new BrowserWindowClass({
              width: 520,
              height: 720,
              minWidth: 420,
              minHeight: 620,
              autoHideMenuBar: true,
              backgroundColor: "#10131a",
              title: "Connect Gmail",
              webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true
              }
            });

            authWindow.on("closed", () => {
              if (!settled) {
                finish(() =>
                  reject(new Error("Gmail sign-in window was closed before authorization completed."))
                );
              }
            });

            await authWindow.loadURL(authUrl);
          }
        } catch (error) {
          finish(() => reject(error));
        }
      });

      let authClient = null;
      let oauthState = "";
    });
  }

  async function signIn(incomingConfig) {
    const config = normalizeConfig(incomingConfig || (await readConfig()));
    requireOAuthConfig(config);

    if (state.authInProgress) {
      throw new Error("A Gmail sign-in is already in progress.");
    }

    state.authInProgress = true;
    state.lastError = "";
    pushState("auth-started");

    try {
      const tokenPayload = await runOAuthFlow(config);
      state.connectedEmail = tokenPayload.connectedEmail;
      await writeTokenFile(tokenPayload);
      state.status = state.running ? "running" : "idle";
      return pushState("auth-signed-in");
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      state.status = state.running ? "error" : "idle";
      pushState("auth-failed");
      throw error;
    } finally {
      state.authInProgress = false;
      pushState("auth-finished");
    }
  }

  async function disconnect() {
    await stop("disconnected");
    await deleteTokenFile();
    state.connectedEmail = "";
    state.lastError = "";
    state.status = "idle";
    return pushState("auth-disconnected");
  }

  function getHeader(message, headerName) {
    const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
    const match = headers.find((header) => header?.name?.toLowerCase() === headerName.toLowerCase());
    return typeof match?.value === "string" ? match.value.trim() : "";
  }

  function buildQuery(watcherConfig) {
    const queryParts = [];

    if (watcherConfig.sender) {
      queryParts.push(`from:${JSON.stringify(watcherConfig.sender)}`);
    }

    if (watcherConfig.subjectContains) {
      queryParts.push(`subject:${JSON.stringify(watcherConfig.subjectContains)}`);
    }

    if (watcherConfig.onlyUnread) {
      queryParts.push("is:unread");
    }

    return queryParts.join(" ").trim();
  }

  function matchesMessage(message, watcherConfig) {
    const fromHeader = getHeader(message, "From").toLowerCase();
    const subjectHeader = getHeader(message, "Subject").toLowerCase();
    const senderNeedle = watcherConfig.sender.toLowerCase();
    const subjectNeedle = watcherConfig.subjectContains.toLowerCase();

    const senderMatched = senderNeedle ? fromHeader.includes(senderNeedle) : true;
    const subjectMatched = subjectNeedle ? subjectHeader.includes(subjectNeedle) : true;

    return senderMatched && subjectMatched;
  }

  function isFreshMessage(message) {
    const internalDate = Number(message?.internalDate);

    if (!Number.isFinite(internalDate) || internalDate <= 0 || state.startedAtMs <= 0) {
      return false;
    }

    return internalDate >= state.startedAtMs - MATCH_FRESHNESS_GRACE_MS;
  }

  function describeMatch(message) {
    const from = getHeader(message, "From") || "Unknown sender";
    const subject = getHeader(message, "Subject") || "No subject";
    return `${from} | ${subject}`;
  }

  function buildAlertPayload(message) {
    const from = getHeader(message, "From") || "Unknown sender";
    const subject = getHeader(message, "Subject") || "No subject";
    const date = getHeader(message, "Date") || "Unknown date";
    const snippet = typeof message.snippet === "string" ? message.snippet.trim() : "";
    const messageUrl = message.id ? `https://mail.google.com/mail/u/0/#all/${message.id}` : "";

    return {
      subject: `Gmail match: ${subject}`,
      text:
        `From: ${from}\n` +
        `Subject: ${subject}\n` +
        `Date: ${date}\n` +
        (messageUrl ? `Message: ${messageUrl}\n` : "") +
        `\nSnippet:\n${snippet || "No preview available."}`
    };
  }

  function summarizeAlertResult(response) {
    const channels = ["desktop notification"];

    if (response?.emailSent) {
      channels.push("email");
    }

    if (response?.discordSent) {
      channels.push(`Discord x${response.discordSentCount || 1}`);
    }

    if (response?.googleVoiceOpened) {
      const attemptCount = Math.max(1, Number(response.googleVoiceAttemptCount) || 1);
      channels.push(
        `Google Voice ${response.googleVoicePhoneNumber}${attemptCount > 1 ? ` x${attemptCount}` : ""}`
      );
    }

    return channels.join(" + ");
  }

  function scheduleNextPoll() {
    clearTimeout(state.timer);

    if (!state.running || !state.currentConfig) {
      state.timer = null;
      return;
    }

    const watcherConfig = getWatcherConfig(state.currentConfig);
    const delayMs = Math.max(5, Number(watcherConfig.checkIntervalSeconds) || 30) * 1000;

    state.timer = setTimeout(() => {
      void poll();
    }, delayMs);
  }

  async function poll() {
    if (!state.running || !state.currentConfig) {
      return;
    }

    const config = normalizeConfig(state.currentConfig);
    const watcherConfig = config.gmailWatcher;

    try {
      const auth = await getAuthorizedClient(config);
      const gmail = google.gmail({ version: "v1", auth });
      const query = buildQuery(watcherConfig);

      state.query = query;
      state.lastCheckAt = new Date().toLocaleTimeString();
      state.lastError = "";

      const listResponse = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: 10,
        includeSpamTrash: false
      });

      const messages = Array.isArray(listResponse.data?.messages) ? listResponse.data.messages : [];
      let matchedMessage = null;

      for (const item of messages) {
        if (
          !watcherConfig.allowRepeatedAlerts &&
          item.id &&
          (state.processedMessageIds.has(item.id) ||
            state.persistedProcessedMessageIds.has(item.id))
        ) {
          continue;
        }

        const messageResponse = await gmail.users.messages.get({
          userId: "me",
          id: item.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "Delivered-To"]
        });

        if (matchesMessage(messageResponse.data, watcherConfig) && isFreshMessage(messageResponse.data)) {
          matchedMessage = messageResponse.data;
          break;
        }
      }

      if (matchedMessage?.id) {
        if (!watcherConfig.allowRepeatedAlerts) {
          state.processedMessageIds.add(matchedMessage.id);
        }

        const alertResponse = await sendAlert(buildAlertPayload(matchedMessage), config);

        if (watcherConfig.markAsProcessed && matchedMessage.id) {
          try {
            state.persistedProcessedMessageIds.add(matchedMessage.id);
            await saveProcessedCache();
          } catch (error) {
            state.lastError = `Match found, but saving processed state failed: ${
              error instanceof Error ? error.message : String(error)
            }`;
          }
        }

        state.lastMatchedEmail = describeMatch(matchedMessage);
        state.lastActionTriggered = summarizeAlertResult(alertResponse);
        state.status = state.lastError ? "error" : "matched";

        if (alertResponse?.error) {
          state.lastError = alertResponse.error;
        }

        pushState("matched");
      } else {
        state.status = "running";
        pushState("checked");
      }
    } catch (error) {
      state.status = "error";
      state.lastError = error instanceof Error ? error.message : String(error);
      pushState("error");
    } finally {
      scheduleNextPoll();
    }
  }

  async function start(incomingConfig) {
    const config = normalizeConfig(incomingConfig || (await readConfig()));
    const watcherConfig = config.gmailWatcher;

    if (!watcherConfig.sender && !watcherConfig.subjectContains) {
      throw new Error("Enter a sender or a subject line before starting the Gmail watcher.");
    }

    await getAuthStatus(config);

    if (!state.connectedEmail) {
      throw new Error("Gmail is not connected. Sign in first.");
    }

    state.currentConfig = config;
    state.running = true;
    state.status = "running";
    state.lastError = "";
    state.query = buildQuery(watcherConfig);
    state.lastMatchedEmail = "";
    state.lastActionTriggered = "";
    state.processedMessageIds.clear();
    state.startedAtMs = Date.now();
    await loadProcessedCache();
    pushState("started");
    void poll();
    return buildSnapshot();
  }

  async function stop(reason = "stopped") {
    clearTimeout(state.timer);
    state.timer = null;
    state.running = false;
    state.startedAtMs = 0;
    state.currentConfig = null;
    state.status = state.lastError && reason !== "stopped" ? "error" : "idle";
    return pushState(reason);
  }

  function dispose() {
    clearTimeout(state.timer);
    state.timer = null;
    state.running = false;
  }

  return {
    getSnapshot: buildSnapshot,
    getAuthStatus,
    signIn,
    disconnect,
    start,
    stop,
    dispose
  };
}

module.exports = {
  createGmailWatcherService
};
