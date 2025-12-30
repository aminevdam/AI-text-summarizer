// Communication with content script

// Simple message sending without waiting for response
async function sendMessageToContent(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        resolve({ ok: false, error: err.message });
      } else {
        resolve(resp || { ok: true });
      }
    });
  });
}

async function sendToContent(tabId, message, retries = 5) {
  // For simple messages don't use storage
  if (message.type === "MM_SHOW_LOADER" || message.type === "MM_HIDE_LOADER" || message.type === "MM_SHOW_MARKDOWN" || message.type === "MM_UPDATE_PROGRESS") {
    return await sendMessageToContent(tabId, message);
  }
  
  // Генерируем уникальный ID запроса для получения ответа из storage
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  message.requestId = requestId;
  
  // Определяем ключ storage
  let storageKey;
  if (message.type === "MM_GET_PDF_TEXT") {
    storageKey = `pdf_response_${requestId}`;
  } else if (message.type === "MM_GET_PAGE_BLOCKS") {
    storageKey = `page_blocks_response_${requestId}`;
  } else {
    // For other message types don't use storage
    return await sendMessageToContent(tabId, message);
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      // Check that tab exists and is loaded
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error(`Tab ${tabId} not found`);
      }

      // Check that tab is fully loaded
      if (tab.status !== "complete") {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Send message to content script
      chrome.tabs.sendMessage(tabId, message);

      // Wait a bit for content script to process
      await new Promise(resolve => setTimeout(resolve, 500));

      // Polling storage - main way to get response
      for (let j = 0; j < 60; j++) {
        const stored = await chrome.storage.local.get(storageKey);
        if (stored[storageKey]) {
          await chrome.storage.local.remove(storageKey);
          return stored[storageKey];
        }
        
        // Check all response keys for fallback (every 10 attempts)
        if (j > 0 && j % 10 === 0) {
          const allStorage = await chrome.storage.local.get(null);
          const matchingKeys = Object.keys(allStorage).filter(k => 
            (message.type === "MM_GET_PDF_TEXT" && k.includes('pdf_response')) ||
            (message.type === "MM_GET_PAGE_BLOCKS" && k.includes('page_blocks_response'))
          );
          if (matchingKeys.length > 0 && !matchingKeys.includes(storageKey)) {
            const fallback = await chrome.storage.local.get(matchingKeys[0]);
            if (fallback[matchingKeys[0]]) {
              await chrome.storage.local.remove(matchingKeys[0]);
              return fallback[matchingKeys[0]];
            }
          }
        }
        
        if (j < 59) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // If no response received, try again
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      } else {
        throw new Error("Could not get response from content script");
      }
    } catch (e) {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error(`[MM] Failed to send message to tab ${tabId}`);
        throw e;
      }
    }
  }
}

// Export to global object (in service worker use self instead of window)
(self || globalThis).BackgroundCommunication = {
  sendToContent,
  sendMessageToContent
};

