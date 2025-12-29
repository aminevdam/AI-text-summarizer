// Mind map generation

// Global variable for tracking active tasks
let activeTasks = new Map();

async function generateMindMap(tabId) {
  const taskId = `mindmap_${tabId}_${Date.now()}`;
  activeTasks.set(taskId, { tabId, startTime: Date.now() });
  
  // Create long-lived connection to keep service worker active
  let keepAlivePort = null;
  try {
    keepAlivePort = chrome.runtime.connect({ name: `keepalive_${taskId}` });
    keepAlivePort.onDisconnect.addListener(() => {
      console.log("[MM] Background: Keep-alive port disconnected");
    });
  } catch (e) {
    console.warn("[MM] Background: Failed to create keep-alive port:", e);
  }
  
  try {
    console.log("[MM] Background: Starting mind map generation for tab", tabId, "task:", taskId);
    
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

    // Try as PDF
    console.log("[MM] Background: Requesting PDF text from content script, tabId:", tabId);
    const pdfResp = await (self || globalThis).BackgroundCommunication.sendToContent(tabId, { type: "MM_GET_PDF_TEXT", maxPages: 30 });
    console.log("[MM] Background: PDF response received:", {
      ok: pdfResp?.ok,
      error: pdfResp?.error,
      blocksCount: pdfResp?.data?.blocks?.length || 0
    });
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
          iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          title: "Error",
          message: "No text blocks found in PDF."
        });
        return;
      }
    } else if (pdfResp?.error === "not_pdf_tab") {
      // Not a PDF, continue as regular page
    } else {
      // PDF extraction error, but might not be a PDF
      console.warn("PDF extraction failed:", pdfResp?.error);
    }

    // Otherwise — regular HTML page
    console.log("[MM] Background: Requesting page blocks from content script, tabId:", tabId);
    const resp = await (self || globalThis).BackgroundCommunication.sendToContent(tabId, { type: "MM_GET_PAGE_BLOCKS" });
    console.log("[MM] Background: Page blocks response received:", {
      ok: resp?.ok,
      blocksCount: resp?.data?.blocks?.length || 0
    });
    if (!resp?.ok) {
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: "Failed to get data from page."
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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
    console.error("[MM] Background: Error generating mind map:", e);
    try {
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: `Error: ${e.message}`
      });
    } catch (sendErr) {
      console.error("[MM] Background: Failed to send error message:", sendErr);
    }
    chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      title: "Error",
      message: `Error: ${e.message}`
    });
  } finally {
    if (keepAlivePort) {
      try {
        keepAlivePort.disconnect();
      } catch (e) {
        // Ignore errors on disconnect
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
    
    console.log("[MM] Background: Sending payload to backend, tabId:", tabId);
    console.log("[MM] Background: Payload blocks count:", payload.blocks?.length || 0);
    const resp = await (self || globalThis).BackendAPI.postToBackend(payload);
    console.log("[MM] Background: Backend response:", {
      ok: resp.ok,
      hasMarkdown: !!resp.markdown,
      markdownLength: resp.markdown?.length || 0,
      error: resp.error,
      message: resp.message
    });

    // Show mindmap on page if markdown received
    if (resp.ok && resp.markdown) {
      console.log("[MM] Background: Got markdown, length:", resp.markdown.length);
      try {
        // Check that tab still exists
        let currentTabId = tabId;
        try {
          const tab = await chrome.tabs.get(tabId);
          currentTabId = tab.id;
        } catch (e) {
          console.warn("[MM] Background: Tab not found, trying to find active tab");
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
        
        console.log("[MM] Background: Sending markdown to content script, tabId:", currentTabId);
        const contentResp = await (self || globalThis).BackgroundCommunication.sendToContent(currentTabId, {
          type: "MM_SHOW_MARKDOWN",
          markdown: resp.markdown
        });
        console.log("[MM] Background: Content script response:", contentResp);
        
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
          iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          title: "Mind Map Ready",
          message: "Mind map successfully created and displayed in the sidebar"
        });
      } catch (e) {
        console.error("[MM] Background: Cannot show markdown on page:", e);
        await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
          type: "MM_HIDE_LOADER",
          error: "Failed to display mind map: " + e.message
        });
        chrome.notifications.create({
          type: "basic",
          iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          title: "Error",
          message: "Failed to display mind map: " + e.message
        });
      }
    } else {
      console.error("[MM] Background: Backend response error:", resp);
      const errorMsg = resp.error || resp.message || "Failed to create mind map";
      console.log("[MM] Background: Hiding loader with error:", errorMsg);
      await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
        type: "MM_HIDE_LOADER",
        error: errorMsg
      });
      chrome.notifications.create({
        type: "basic",
        iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        title: "Error",
        message: errorMsg
      });
    }
  } catch (e) {
    console.error("[MM] Background: Error in processAndShowMindMap:", e);
    await (self || globalThis).BackgroundCommunication.sendToContent(tabId, {
      type: "MM_HIDE_LOADER",
      error: "Error sending request: " + e.message
    });
    chrome.notifications.create({
      type: "basic",
      iconUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
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

