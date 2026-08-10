// background.js — Service worker for DSA Tracker extension
// Keeps the extension alive and handles any cross-context messaging.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[DSA Tracker] Extension installed.");
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "PING") {
    sendResponse({ alive: true });
  }
  return true; // keep message channel open for async responses
});
