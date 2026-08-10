// popup.js — DSA Tracker LeetCode Connector

const SESSION_COOKIE = "LEETCODE_SESSION";
const CSRF_COOKIE    = "csrftoken";
const LC_URL         = "https://leetcode.com";

// ── Helpers ────────────────────────────────────────────────────────────────

function showMsg(text, type = "info") {
  const el = document.getElementById("msg");
  el.textContent = text;
  el.className = `msg ${type}`;
}

function setBadge(id, text, type) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className   = `badge ${type}`;
}

async function getServerUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(["serverUrl"], r => resolve(r.serverUrl || ""));
  });
}

async function saveServerUrl(url) {
  return new Promise(resolve => {
    chrome.storage.local.set({ serverUrl: url }, resolve);
  });
}

// Extension pairing token — kept ONLY in chrome.storage.local, never in a
// normal webpage's localStorage. This is what authenticates /save_cookie
// requests (see routes/extension.py's save_cookie_extension on the backend).
async function getExtensionToken() {
  return new Promise(resolve => {
    chrome.storage.local.get(["extensionToken"], r => resolve(r.extensionToken || ""));
  });
}

async function saveExtensionToken(token) {
  return new Promise(resolve => {
    chrome.storage.local.set({ extensionToken: token }, resolve);
  });
}

async function clearExtensionToken() {
  return new Promise(resolve => {
    chrome.storage.local.remove(["extensionToken"], resolve);
  });
}

async function getLCCookie(name) {
  return new Promise(resolve => {
    chrome.cookies.get({ url: LC_URL, name }, cookie => {
      resolve(cookie ? cookie.value : null);
    });
  });
}

async function refreshPairBadge() {
  const token = await getExtensionToken();
  setBadge("pairBadge", token ? "Paired ✓" : "Not paired", token ? "ok" : "warn");
  return token;
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  // Restore saved server URL
  const savedUrl = await getServerUrl();
  if (savedUrl) {
    document.getElementById("serverInput").value = savedUrl;
    setBadge("serverBadge", "Saved", "ok");
  }

  // Restore pairing status
  const paired = await refreshPairBadge();

  // Check LeetCode cookies
  const session = await getLCCookie(SESSION_COOKIE);
  const csrf    = await getLCCookie(CSRF_COOKIE);

  setBadge("sessionBadge",
    session ? "Found ✓" : "Not found",
    session ? "ok" : "warn"
  );
  setBadge("csrfBadge",
    csrf ? "Found ✓" : "Not found",
    csrf ? "ok" : "warn"
  );

  if (!paired) {
    showMsg(
      "⚠️ Extension is not paired. Paste your extension token above and click Pair Extension first.",
      "info"
    );
  } else if (!session || !csrf) {
    showMsg(
      "⚠️ Open leetcode.com and log in first, then come back and click Connect.",
      "info"
    );
  }
}

// ── Pair Button ────────────────────────────────────────────────────────────

document.getElementById("pairBtn").addEventListener("click", async () => {
  const tokenInput = document.getElementById("tokenInput");
  const token = tokenInput.value.trim();

  if (!token) {
    showMsg("❌ Paste your extension token first.", "error");
    return;
  }

  await saveExtensionToken(token);
  tokenInput.value = "";
  await refreshPairBadge();
  showMsg("✅ Extension paired. You can now click Connect LeetCode.", "success");
});

// ── Connect Button ─────────────────────────────────────────────────────────

document.getElementById("connectBtn").addEventListener("click", async () => {
  const btn = document.getElementById("connectBtn");
  btn.disabled = true;
  btn.textContent = "⏳ Connecting…";

  // Get / save server URL
  const rawUrl = document.getElementById("serverInput").value.trim().replace(/\/$/, "");
  if (!rawUrl) {
    showMsg("❌ Enter your DSA Tracker server URL first.", "error");
    btn.disabled = false;
    btn.textContent = "🔗 Connect LeetCode";
    return;
  }
  await saveServerUrl(rawUrl);
  setBadge("serverBadge", "Saved", "ok");

  // Extension must be paired before we ever touch /save_cookie.
  const extensionToken = await getExtensionToken();
  if (!extensionToken) {
    showMsg(
      "❌ Extension is not paired. Please pair the extension with your DSA Tracker account first.",
      "error"
    );
    btn.disabled = false;
    btn.textContent = "🔗 Connect LeetCode";
    return;
  }

  // Read LeetCode cookies
  const session = await getLCCookie(SESSION_COOKIE);
  const csrf    = await getLCCookie(CSRF_COOKIE);

  if (!session || !csrf) {
    showMsg("❌ LeetCode cookies not found. Please log in to leetcode.com first.", "error");
    btn.disabled = false;
    btn.textContent = "🔗 Connect LeetCode";
    return;
  }

  // POST to Flask, authenticated via the extension's paired token — NOT the
  // Flask browser session (the extension has none). See routes/extension.py.
  try {
    const res = await fetch(`${rawUrl}/save_cookie`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${extensionToken}`
      },
      body: JSON.stringify({
        leetcode_session: session,
        csrf_token: csrf
      })
    });

    let data = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    }

    if (res.status === 200 && data && data.success) {
      showMsg("✅ LeetCode connected! Sync will run automatically.", "success");
      setBadge("sessionBadge", "Connected ✓", "ok");
      setBadge("csrfBadge",    "Connected ✓", "ok");
    } else if (res.status === 401) {
      // Token missing/invalid/revoked — don't just say "401", tell them
      // exactly what to do about it.
      showMsg(
        "❌ Extension token is invalid or not paired. Please pair the extension again in Settings.",
        "error"
      );
      setBadge("pairBadge", "Not paired", "warn");
    } else if (res.status === 400) {
      showMsg(`❌ ${(data && data.message) || "Missing or invalid cookie data."}`, "error");
    } else if (res.status === 403) {
      showMsg(`❌ ${(data && data.message) || "Forbidden."}`, "error");
    } else if (res.status >= 500) {
      showMsg(`❌ ${(data && data.message) || "Server error. Please try again shortly."}`, "error");
    } else {
      showMsg(`❌ ${(data && data.message) || `Unexpected server response (${res.status}).`}`, "error");
    }
  } catch (err) {
    console.error(err);
    showMsg(`❌ Could not reach the server: ${err.message}`, "error");
  }

  btn.disabled = false;
  btn.textContent = "🔗 Connect LeetCode";
});

// ── Clear Button ───────────────────────────────────────────────────────────

document.getElementById("clearBtn").addEventListener("click", async () => {
  await new Promise(r => chrome.storage.local.remove(["serverUrl"], r));
  await clearExtensionToken();
  document.getElementById("serverInput").value = "";
  setBadge("serverBadge", "Cleared", "warn");
  await refreshPairBadge();
  showMsg("Server URL and pairing cleared.", "info");
});

// ── Run ────────────────────────────────────────────────────────────────────
init();
