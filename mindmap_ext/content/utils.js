// Utilities for content script

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function parseLeafLink(line) {
  const m = line.match(/\((mm:\/\/[^)]+)\)/);
  return m ? m[1] : null;
}

function stripMdLinks(text) {
  return text.replace(/\[[^\]]+\]\([^)]+\)/g, "").replace(/\s+/g, " ").trim();
}

function highlightByXPath(xpath) {
  if (!xpath) return;
  
  // Check if this is a PDF xpath (format: //pdf[@page="N"][@block="M"])
  const pdfMatch = xpath.match(/\/\/pdf\[@page="(\d+)"\]/);
  if (pdfMatch) {
    const pageNum = parseInt(pdfMatch[1], 10);
    // For PDF, try to scroll to the page
    // PDF.js renders pages in canvas elements, so we scroll to approximate position
    // Each PDF page is typically around 800-1000px tall
    const estimatedPageHeight = 900; // Approximate height of a PDF page
    const scrollPosition = (pageNum - 1) * estimatedPageHeight;
    window.scrollTo({ top: scrollPosition, behavior: "smooth" });
    return;
  }
  
  // For regular HTML elements, use standard xpath evaluation
  const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.outline = "3px solid orange";
  setTimeout(() => (el.style.outline = ""), 2000);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openPopout(markdown) {
  const w = Math.round(window.innerWidth * 0.9);
  const h = Math.round(window.innerHeight * 0.9);
  const win = window.open("", "mindmap_popout", `width=${w},height=${h}`);

  if (!win) {
    alert("Failed to open window (popup blocker may be enabled).");
    return;
  }

  // Вставляем минимальный HTML + контейнер
  win.document.open();
  win.document.write(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Mind Map</title>
  <style>
    html, body { height: 100%; margin: 0; }
    #app { height: 100%; }
  </style>
</head>
<body>
  <div id="app"></div>
</body>
</html>
  `);
  win.document.close();

  // Передаём markdown через глобал
  win.__MM_MARKDOWN__ = markdown;
}

function handleMmLink(href) {
  try {
    const u = new URL(href);

    if (u.hostname === "page") {
      const xpath = decodeURIComponent(u.searchParams.get("xpath") || "");
      highlightByXPath(xpath);
      return;
    }
  } catch (err) {
    console.warn("Bad mm link:", href, err);
  }
}

function attachMmLinkInterceptor(panel) {
  if (panel.__mmLinkInterceptorAttached) return;
  panel.__mmLinkInterceptorAttached = true;

  panel.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;

    const href = a.getAttribute("href") || a.getAttribute("xlink:href");
    if (!href || !href.startsWith("mm://")) return;

    e.preventDefault();
    e.stopPropagation();
    handleMmLink(href);
  }, true);
}

// Export to global object
window.ContentUtils = {
  uid,
  parseLeafLink,
  stripMdLinks,
  highlightByXPath,
  downloadBlob,
  openPopout,
  handleMmLink,
  attachMmLinkInterceptor
};

