// Message handling from background script

// Message handler from popup/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg?.type) return;

  if (msg.type === "MM_GET_PDF_TEXT") {
    console.log("[MM] Content: Received MM_GET_PDF_TEXT request, requestId:", msg.requestId);
    (async () => {
      try {
        if (!window.PdfExtractor.isPdfTab()) {
          console.log("[MM] Content: Not a PDF tab");
          const response = { ok: false, error: "not_pdf_tab" };
          if (msg.requestId) {
            await chrome.storage.local.set({
              [`pdf_response_${msg.requestId}`]: response
            });
          }
          sendResponse(response);
          return;
        }
        console.log("[MM] Content: Extracting PDF text, maxPages:", msg.maxPages ?? 30);
        const data = await window.PdfExtractor.extractPdfTextFromCurrentTab({ maxPages: msg.maxPages ?? 30 });
        console.log("[MM] Content: PDF extraction complete, blocks:", data.blocks?.length || 0);
        
        const response = { ok: true, data };
        
        if (msg.requestId) {
          const storageKey = `pdf_response_${msg.requestId}`;
          console.log("[MM] Content: Saving to storage, key:", storageKey, "data blocks:", data.blocks?.length || 0);
          await chrome.storage.local.set({
            [storageKey]: response
          });
          
          const verify = await chrome.storage.local.get(storageKey);
          console.log("[MM] Content: Storage verification, saved:", !!verify[storageKey], "key exists:", storageKey in verify);
        } else {
          console.warn("[MM] Content: No requestId provided, cannot save to storage");
        }
        
        sendResponse(response);
        console.log("[MM] Content: Response sent for MM_GET_PDF_TEXT");
      } catch (e) {
        console.error("[MM] Content: PDF extract error:", e);
        const response = { ok: false, error: String(e?.message || e) };
        if (msg.requestId) {
          await chrome.storage.local.set({
            [`pdf_response_${msg.requestId}`]: response
          });
        }
        sendResponse(response);
      }
    })();

    return true; // Держим канал открытым
  }

  if (msg.type === "MM_GET_PAGE_BLOCKS") {
    console.log("[MM] Content: Received MM_GET_PAGE_BLOCKS request");
    (async () => {
      const data = window.WebExtractor.collectTextBlocksQuality();
      console.log("[MM] Content: Collected blocks:", data.blocks?.length || 0);
      
      if (msg.requestId) {
        await chrome.storage.local.set({
          [`page_blocks_response_${msg.requestId}`]: { ok: true, data }
        });
      }
      
      sendResponse({ ok: true, data });
      console.log("[MM] Content: Response sent for MM_GET_PAGE_BLOCKS");
    })();
    return true;
  }

  if (msg.type === "MM_SHOW_MARKDOWN") {
    try {
      console.log("[MM] Received MM_SHOW_MARKDOWN, markdown length:", msg.markdown?.length || 0);
      window.MindMapRenderer.renderMindElixir(msg.markdown);
      window.Sidebar.hideLoader();
      console.log("[MM] Mind map rendered successfully");
      sendResponse({ ok: true });
    } catch (e) {
      console.error("[MM] Error rendering mind map:", e);
      window.Sidebar.hideLoader();
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (msg.type === "MM_SHOW_LOADER") {
    try {
      window.Sidebar.showLoader();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  if (msg.type === "MM_HIDE_LOADER") {
    try {
      window.Sidebar.hideLoader(msg.error);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }
});

