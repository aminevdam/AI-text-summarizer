// Communication with backend

const BACKEND_URL = "https://api.mindmapai.tech/mindmap_markdown";
const API_TOKEN = "pJ8xTTnkKQ64B9AB8dOcqQrtZdOhYFBRgpRWYYGqnxzTbui4Ipi6zZGOz_sG-SnC";


async function postToBackend(payload) {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const TIMEOUT_MS = 600000; // 10 minutes timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, TIMEOUT_MS);
    
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).catch(err => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        console.error("[MM] Request timeout after 10 minutes");
        throw new Error("Request timeout: backend took more than 10 minutes to respond.");
      }
      console.error("[MM] Network error:", err.message);
      throw new Error(`Network error: ${err.message}`);
    });

    clearTimeout(timeoutId);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[MM] Backend response received (${elapsed}s)`);
    
    const text = await res.text();
    
    if (!res.ok) {
      console.error("[MM] HTTP error", res.status);
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
    }
    
    try {
      const parsed = JSON.parse(text);
      if (!parsed.ok) {
        console.error("[MM] Backend returned error:", parsed.error);
      }
      return parsed;
    } catch (e) {
      console.error("[MM] Failed to parse response");
      return { ok: false, error: "Failed to parse response", raw: text };
    }
  } catch (error) {
    console.error("[MM] Backend error:", error.message);
    throw error;
  }
}

// Export to global object (in service worker use self instead of window)
(self || globalThis).BackendAPI = {
  postToBackend,
  BACKEND_URL
};

