// Communication with backend

const BACKEND_URL = "http://127.0.0.1:8000/mindmap_markdown";
const API_TOKEN = "pJ8xTTnkKQ64B9AB8dOcqQrtZdOhYFBRgpRWYYGqnxzTbui4Ipi6zZGOz_sG-SnC";


async function postToBackend(payload) {
  console.log("[MM] Background: sending request to", BACKEND_URL);
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json",
              "Authorization": `Bearer ${API_TOKEN}`,
              },
    body: JSON.stringify(payload)
  });

  console.log("[MM] Background: response status", res.status, res.statusText);
  const text = await res.text();
  console.log("[MM] Background: response text length", text.length);
  
  if (!res.ok) {
    console.error("[MM] Background: HTTP error", res.status, text);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  
  try {
    const parsed = JSON.parse(text);
    console.log("[MM] Background: parsed response", {
      ok: parsed.ok,
      hasMarkdown: !!parsed.markdown,
      markdownLength: parsed.markdown?.length || 0
    });
    return parsed;
  } catch (e) {
    console.warn("[MM] Background: failed to parse JSON, returning raw text");
    return { raw: text };
  }
}

// Export to global object (in service worker use self instead of window)
(self || globalThis).BackendAPI = {
  postToBackend,
  BACKEND_URL
};

