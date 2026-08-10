// content.js — Runs on leetcode.com pages
// Checks login state and notifies background if user is logged in.

(function () {
  // Check if the user appears to be logged in by looking for nav user avatar
  const isLoggedIn = !!(
    document.querySelector('[data-cy="user-avatar"]') ||
    document.querySelector('.nav-user-icon-base') ||
    document.querySelector('[href^="/u/"]')
  );

  if (isLoggedIn) {
    chrome.runtime.sendMessage({ type: "LC_LOGGED_IN", url: location.href });
  }
})();
