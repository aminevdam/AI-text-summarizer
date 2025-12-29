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
      console.error("[MM] Background: Unhandled error in generateMindMap:", err);
    });
    // Отправляем немедленный ответ, что процесс запущен
    sendResponse({ ok: true, message: "Generation started" });
    return true; // Держим канал открытым для асинхронного ответа
  }
});

// Restore tasks on service worker restart
chrome.runtime.onStartup.addListener(async () => {
  console.log("[MM] Background: Service worker started, checking for active tasks");
  const allData = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(allData)) {
    if (key.startsWith("task_") && value.status && value.status !== "completed") {
      console.log("[MM] Background: Found incomplete task:", key, value);
      // Можно попробовать восстановить задачу, но проще просто очистить
      await chrome.storage.local.remove(key);
    }
  }
});

// Keep service worker active
chrome.runtime.onConnect.addListener((port) => {
  console.log("[MM] Background: Connection established");
  port.onDisconnect.addListener(() => {
    console.log("[MM] Background: Connection closed");
  });
});

chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
});
