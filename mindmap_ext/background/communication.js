// Communication with content script

// Simple message sending without waiting for response (for MM_SHOW_LOADER, MM_HIDE_LOADER)
async function sendMessageToContent(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        // Игнорируем ошибки - это нормально
        resolve({ ok: false, error: err.message });
      } else {
        resolve(resp || { ok: true });
      }
    });
  });
}

async function sendToContent(tabId, message, retries = 5) {
  console.log(`[MM] Background: sendToContent called, tabId: ${tabId}, message type: ${message.type}, retries: ${retries}`);
  
  // For simple messages don't use storage
  if (message.type === "MM_SHOW_LOADER" || message.type === "MM_HIDE_LOADER") {
    return await sendMessageToContent(tabId, message);
  }
  
  // Генерируем уникальный ID запроса для получения ответа из storage
  const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  message.requestId = requestId;
  
  // Определяем ключ storage
  let storageKey;
  console.log(`[MM] Background: Determining storage key, message.type: "${message.type}", typeof: ${typeof message.type}`);
  if (message.type === "MM_GET_PDF_TEXT") {
    storageKey = `pdf_response_${requestId}`;
    console.log(`[MM] Background: Using PDF storage key: ${storageKey}`);
  } else if (message.type === "MM_GET_PAGE_BLOCKS") {
    storageKey = `page_blocks_response_${requestId}`;
    console.log(`[MM] Background: Using page blocks storage key: ${storageKey}`);
  } else {
    console.log(`[MM] Background: Unknown message type, using simple send: ${message.type}`);
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

      console.log(`[MM] Background: Tab ${tabId} status: ${tab.status}, url: ${tab.url}`);

      // Check that tab is fully loaded
      if (tab.status !== "complete") {
        console.log(`[MM] Background: Tab ${tabId} not complete, status: ${tab.status}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      
      // Send message to content script
      console.log(`[MM] Background: Sending message to tab ${tabId}, attempt ${i + 1}/${retries}, requestId: ${requestId}, storageKey: ${storageKey}`);

      // Send message (ignore errors - this is normal)
      chrome.tabs.sendMessage(tabId, message, (resp) => {
        const err = chrome.runtime.lastError;
        if (!err && resp) {
          console.log(`[MM] Background: Got direct response:`, resp);
        }
        // Ignore errors - this is normal when service worker stops
      });

      // Wait a bit for content script to process
      await new Promise(resolve => setTimeout(resolve, 500));

      // Polling storage - main way to get response
      console.log(`[MM] Background: Polling storage for response, key: ${storageKey}`);
      for (let j = 0; j < 60; j++) {
        const stored = await chrome.storage.local.get(storageKey);
        if (stored[storageKey]) {
          console.log(`[MM] Background: ✅ Got response from storage (attempt ${j + 1}):`, {
            ok: stored[storageKey].ok,
            blocksCount: stored[storageKey].data?.blocks?.length || 0
          });
          await chrome.storage.local.remove(storageKey);
          return stored[storageKey];
        }
        
        // Check all response keys for debugging (every 10 attempts)
        if (j > 0 && j % 10 === 0) {
          const allStorage = await chrome.storage.local.get(null);
          const matchingKeys = Object.keys(allStorage).filter(k => 
            (message.type === "MM_GET_PDF_TEXT" && k.includes('pdf_response')) ||
            (message.type === "MM_GET_PAGE_BLOCKS" && k.includes('page_blocks_response'))
          );
          if (matchingKeys.length > 0 && !matchingKeys.includes(storageKey)) {
            console.log(`[MM] Background: Found response keys:`, matchingKeys);
            // Пробуем использовать первый найденный ключ
            const fallback = await chrome.storage.local.get(matchingKeys[0]);
            if (fallback[matchingKeys[0]]) {
              console.log(`[MM] Background: ✅ Using fallback response from: ${matchingKeys[0]}`);
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
        console.log(`[MM] Background: No response after polling, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      } else {
        throw new Error("Could not get response from content script");
      }
    } catch (e) {
      console.warn(`[MM] Background: Retry ${i + 1}/${retries} sending message to tab ${tabId}:`, e.message);
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.error(`[MM] Background: All retries failed for tab ${tabId}`);
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

