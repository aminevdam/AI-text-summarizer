const $ = (id) => document.getElementById(id);

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("no_active_tab");
  return tab;
}

// Load and display current page info
async function loadPageInfo() {
  try {
    const tab = await getActiveTab();
    
    // Set favicon
    const faviconEl = $("pageFavicon");
    if (tab.favIconUrl) {
      faviconEl.src = tab.favIconUrl;
      faviconEl.style.display = "block";
    } else {
      // Fallback to default icon if no favicon
      faviconEl.src = chrome.runtime.getURL("img/icon.png");
      faviconEl.style.display = "block";
    }
    
    // Set page title
    const titleEl = $("pageTitle");
    titleEl.textContent = tab.title || "Untitled Page";
    
    // Set page URL (truncate if too long)
    const urlEl = $("pageUrl");
    let url = tab.url || "";
    if (url.length > 50) {
      url = url.substring(0, 47) + "...";
}
    urlEl.textContent = url;
    
  } catch (e) {
    console.error("[MM] Popup: Error loading page info:", e);
    $("pageTitle").textContent = "Error loading page info";
    $("pageUrl").textContent = "";
  }
}

// Load page info when popup opens
loadPageInfo();



// ---------- BUILD (ONE BUTTON) ----------
$("build").addEventListener("click", async () => {
    try {
      const tab = await getActiveTab();

    // Create long-lived connection to keep service worker active
    // This connection will keep the service worker active even after popup closes
    const port = chrome.runtime.connect({ name: "mindmap_generation" });
    
    port.onMessage.addListener((msg) => {
      console.log("[MM] Popup: Message from background:", msg);
    });
    
    port.onDisconnect.addListener(() => {
      console.log("[MM] Popup: Port disconnected");
    });
    
    // Send message to background script to generate mind map
    chrome.runtime.sendMessage({
      type: "MM_GENERATE_MINDMAP",
      tabId: tab.id,
      portName: port.name
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[MM] Popup: Error sending message to background:", chrome.runtime.lastError);
        port.disconnect();
      } else {
        console.log("[MM] Popup: Background script response:", response);
        // Keep connection open to keep service worker active
        // Connection will close automatically when popup closes, which is fine
        // Service worker should continue working thanks to active tasks
      }
    });
  } catch (e) {
    console.error("[MM] Popup: Error:", e);
  }
});