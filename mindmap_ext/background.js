// Main background script file
// Loads all modules in the correct order

// Load modules
importScripts(
  'background/utils.js',
  'background/communication.js',
  'background/backend.js',
  'background/mindmap-generator.js'
);

// Message handler from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "MM_GENERATE_MINDMAP") {
    // Запускаем генерацию в фоне (не ждем завершения для sendResponse)
    (self || globalThis).MindMapGenerator.generateMindMap(msg.tabId).catch(err => {
      console.error("[MM] Unhandled error:", err.message);
    });
    // Отправляем немедленный ответ, что процесс запущен
    sendResponse({ ok: true, message: "Generation started" });
    return true; // Держим канал открытым для асинхронного ответа
  }
});

// Restore tasks on service worker restart
chrome.runtime.onStartup.addListener(async () => {
  const allData = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("task_") && value.status && value.status !== "completed") {
      await chrome.storage.local.remove(key);
    }
  }
});

// Keep service worker active
chrome.runtime.onConnect.addListener((port) => {
  // Handle keepalive messages
  port.onMessage.addListener((msg) => {
    if (msg.type === "keepalive") {
      try {
        port.postMessage({ type: "keepalive_ack", taskId: msg.taskId });
      } catch (e) {
        // Ignore
      }
    }
  });
});

// Handle alarms to keep service worker active during long operations
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("keepalive_")) {
    // Keep service worker active
  }
});

chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
});
