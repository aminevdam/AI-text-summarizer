// Mind map generation

// Global variable for tracking active tasks
let activeTasks = new Map();

async function generateMindMap(tabId) {
  const taskId = `mindmap_${tabId}_${Date.now()}`;
  activeTasks.set(taskId, { tabId, startTime: Date.now() });
  
  // Use chrome.alarms to keep service worker active during long operations
  // Also create a self-connecting port as backup
  let keepAliveAlarm = null;
  let keepAliveInterval = null;
  
  try {
    // Create alarm that fires every 20 seconds to keep service worker alive
    const alarmName = `keepalive_${taskId}`;
    chrome.alarms.create(alarmName, { periodInMinutes: 0.33 }); // ~20 seconds
    keepAliveAlarm = alarmName;
    
    // Also use setInterval as additional keep-alive mechanism
    keepAliveInterval = setInterval(() => {
      // Keep service worker active
    }, 15000); // Every 15 seconds
    
  } catch (e) {
    // Ignore keep-alive errors
  }
  
  try {
    
    // Save task to storage for recovery on restart
    await chrome.storage.local.set({
      [`task_${taskId}`]: {
        tabId,
        status: "extracting",
        startTime: Date.now()
      }
    });
    
    // Open sidebar with loader
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_SHOW_LOADER"
    });
    
    // Update progress: Starting
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_UPDATE_PROGRESS",
      percent: 5,
      stage: "Initializing..."
    });

    // Save sidebar state to storage
    const tab = await chrome.tabs.get(tabId);
    await chrome.storage.local.set({
      sidebarOpen: true,
      sidebarTabId: tabId,
      sidebarUrl: tab.url,
      [`task_${taskId}`]: {
        tabId,
        status: "extracting",
        startTime: Date.now()
      }
    });

    // Update progress: Extracting content
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_UPDATE_PROGRESS",
      percent: 10,
      stage: "Extracting content from page..."
    });
    
    // Try as PDF
    const pdfResp = await (self || globalThis).BackgroundCommunication.sendToContent(tabId, { type: "MM_GET_PDF_TEXT", maxPages: 30 });
    if (pdfResp?.ok) {
      if (pdfResp.data.blocks && pdfResp.data.blocks.length > 0) {
        const blocks = pdfResp.data.blocks;
        const payload = {
          ...(self || globalThis).BackgroundUtils.basePayloadBase(),
          input_type: "page_blocks",
          title: pdfResp.data.title || pdfResp.data.url || "pdf",
          page: { url: pdfResp.data.url, title: pdfResp.data.title },
          blocks: blocks
        };

        await processAndShowMindMap(payload, tabId);
        return;
      } else {
        await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
          type: "MM_HIDE_LOADER",
          error: "No text blocks found in PDF."
        });
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL('img/icon.png'),
          title: "Error",
          message: "No text blocks found in PDF."
        });
        return;
      }
    } else if (pdfResp?.error === "not_pdf_tab") {
      // Not a PDF, continue as regular page
    }

    // Otherwise — regular HTML page
    const resp = await (self || globalThis).BackgroundCommunication.sendToContent(tabId, { type: "MM_GET_PAGE_BLOCKS" });
    
    // Update progress: Content extracted
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_UPDATE_PROGRESS",
      percent: 20,
      stage: "Content extracted, preparing data..."
    });
    if (!resp?.ok) {
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: "Failed to get data from page."
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL('img/icon.png'),
        title: "Error",
        message: "Failed to get data from page."
      });
      return;
    }

    const data = resp.data;
    const blocks = data.blocks || [];
    if (!blocks.length) {
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: "No text blocks found on page."
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL('img/icon.png'),
        title: "Error",
        message: "No text blocks found on page."
      });
      return;
    }

    const payload = {
      ...(self || globalThis).BackgroundUtils.basePayloadBase(),
      input_type: "page_blocks",
      title: data.title || data.url,
      page: { url: data.url, title: data.title },
      blocks
    };

    await processAndShowMindMap(payload, tabId, taskId);
  } catch (e) {
    console.error("[MM] Error generating mind map:", e.message);
    try {
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: `Error: ${e.message}`
      });
    } catch (sendErr) {
      // Ignore send errors
    }
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL('img/icon.png'),
      title: "Error",
      message: `Error: ${e.message}`
    });
  } finally {
    // Clean up keep-alive mechanisms
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    if (keepAliveAlarm) {
      try {
        chrome.alarms.clear(keepAliveAlarm);
      } catch (e) {
        // Ignore
      }
    }
    activeTasks.delete(taskId);
    await chrome.storage.local.remove(`task_${taskId}`);
  }
}

async function processAndShowMindMap(payload, tabId, taskId) {
  try {
    // Update task status
    if (taskId) {
      await chrome.storage.local.set({
        [`task_${taskId}`]: {
          tabId,
          status: "processing",
          startTime: Date.now()
        }
      });
    }
    
    // Update progress: Sending to backend
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_UPDATE_PROGRESS",
      percent: 25,
      stage: "Sending data to backend..."
    });
    
    let resp;
    let progressInterval = null;
    try {
      // Simulate progress during backend processing
      progressInterval = setInterval(async () => {
        const currentProgress = await chrome.storage.local.get("mm_current_progress");
        const progress = currentProgress.mm_current_progress || 25;
        if (progress < 90) {
          const newProgress = Math.min(90, progress + 2);
          await chrome.storage.local.set({ mm_current_progress: newProgress });
          await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
            type: "MM_UPDATE_PROGRESS",
            percent: newProgress,
            stage: "Processing with AI... (this may take a few minutes)"
          });
        }
      }, 3000); // Update every 3 seconds
      
      resp = await (self || globalThis).BackendAPI.postToBackend(payload);
      
      clearInterval(progressInterval);
      await chrome.storage.local.remove("mm_current_progress");
    } catch (error) {
      console.error("[MM] Backend error:", error.message);
      
      // Clear progress interval if it exists
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      await chrome.storage.local.remove("mm_current_progress");
      
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: `Backend error: ${error?.message || "Unknown error"}`
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL('img/icon.png'),
        title: "Error",
        message: `Failed to connect to backend: ${error?.message || "Unknown error"}`
      });
      return;
    }

    // Show mindmap on page if markdown received
    if (resp.ok && resp.markdown) {
      // Update progress: Processing complete
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_UPDATE_PROGRESS",
        percent: 95,
        stage: "Rendering mind map..."
      });
      
      try {
        // Check that tab still exists
        let currentTabId = tabId;
        try {
          const tab = await chrome.tabs.get(tabId);
          currentTabId = tab.id;
        } catch (e) {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]) {
            currentTabId = tabs[0].id;
          }
        }
        
        // Update task status
        if (taskId) {
          await chrome.storage.local.set({
            [`task_${taskId}`]: {
              tabId: currentTabId,
              status: "rendering",
              startTime: Date.now()
            }
          });
        }
        
        // Update progress: Finalizing
        await (self || globalThis).BackgroundCommunication.sendToContent(currentTabId, {
          type: "MM_UPDATE_PROGRESS",
          percent: 100,
          stage: "Complete!"
        });
        
        await (self || globalThis).BackgroundCommunication.sendToContent(currentTabId, {
          type: "MM_SHOW_MARKDOWN",
          markdown: resp.markdown
        });
        
        // Task completed
        if (taskId) {
          await chrome.storage.local.set({
            [`task_${taskId}`]: {
              tabId: currentTabId,
              status: "completed",
              startTime: Date.now()
            }
          });
        }
        
        // Show success notification
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL('img/icon.png'),
          title: "Mind Map Ready",
          message: "Mind map successfully created and displayed in the sidebar"
        });
      } catch (e) {
        console.error("[MM] Cannot show markdown:", e.message);
        await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
          type: "MM_HIDE_LOADER",
          error: "Failed to display mind map: " + e.message
        });
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL('img/icon.png'),
          title: "Error",
          message: "Failed to display mind map: " + e.message
        });
      }
    } else {
      const errorMsg = resp.error || resp.message || "Failed to create mind map";
      console.error("[MM] Backend error:", errorMsg);
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: errorMsg
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL('img/icon.png'),
        title: "Error",
        message: errorMsg
      });
    }
  } catch (e) {
    console.error("[MM] Error in processAndShowMindMap:", e.message);
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_HIDE_LOADER",
      error: "Error sending request: " + e.message
    });
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL('img/icon.png'),
      title: "Error",
      message: "Error sending request: " + e.message
    });
  }
}

// Export to global object (in service worker use self instead of window)
(self || globalThis).MindMapGenerator = {
  generateMindMap,
  processAndShowMindMap
};

