// Utilities for background script

function nowISO() {
  return new Date().toISOString();
}

function basePayloadBase() {
  return {
    schema_version: "1.0",
    created_at: nowISO(),
    client: {
      kind: "chrome_extension",
      version: chrome.runtime.getManifest().version
    }
  };
}

// Export to global object (in service worker use self instead of window)
(self || globalThis).BackgroundUtils = {
  nowISO,
  basePayloadBase
};

