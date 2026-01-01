// Mind map sidebar management

function ensureMindmapSidebar() {
  let panel = document.getElementById("mm-panel");
  if (panel) return panel;

  // Inject styles with unified color palette
  if (!document.getElementById("mm-styles")) {
    const styleSheet = document.createElement("style");
    styleSheet.id = "mm-styles";
    styleSheet.textContent = `
      #mm-panel {
        /* Primary Orange Palette */
        --primary-50: #fff7ed;
        --primary-100: #ffedd5;
        --primary-200: #fed7aa;
        --primary-300: #fdba74;
        --primary-400: #fb923c;
        --primary-500: #f97316;  /* Main primary color - Orange */
        --primary-600: #ea580c;
        --primary-700: #c2410c;
        --primary-800: #9a3412;
        --primary-900: #7c2d12;
        
        /* Neutral Colors - Black & White */
        --gray-50: #ffffff;  /* White */
        --gray-100: #f5f5f5;
        --gray-200: #e5e5e5;
        --gray-300: #d4d4d4;
        --gray-400: #a3a3a3;
        --gray-500: #737373;
        --gray-600: #525252;
        --gray-700: #404040;
        --gray-800: #262626;
        --gray-900: #000000;  /* Black */
        
        /* Semantic Colors */
        --error: #ef4444;
        --error-bg: #fef2f2;
        --error-border: #fecaca;
        
        /* Shadows */
        --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
        --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        
        /* Typography */
        --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      }
      
      #mm-panel .mm-header {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--gray-200);
        background: var(--gray-50);
        box-shadow: var(--shadow-sm);
      }
      
      #mm-panel .mm-header strong {
        font-size: 18px;
        font-weight: 600;
        color: var(--gray-900);
        font-family: var(--font-family);
        letter-spacing: -0.01em;
      }
      
      #mm-panel .mm-header-buttons {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      #mm-panel .mm-download-dropdown {
        position: relative;
        display: inline-block;
      }
      
      #mm-panel .mm-download-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        border: 1px solid var(--primary-500);
        background: var(--primary-500);
        color: white;
        cursor: pointer;
        transition: all 200ms ease;
        font-family: var(--font-family);
        white-space: nowrap;
      }
      
      #mm-panel .mm-download-btn:hover:not(:disabled) {
        background: var(--primary-600);
        border-color: var(--primary-600);
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }
      
      #mm-panel .mm-download-btn:active:not(:disabled) {
        background: var(--primary-700);
        transform: translateY(0);
      }
      
      #mm-panel .mm-download-btn .mm-dropdown-arrow {
        width: 0;
        height: 0;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 7px solid currentColor;
        transition: transform 200ms ease;
      }
      
      #mm-panel .mm-download-btn.open .mm-dropdown-arrow {
        transform: rotate(180deg);
      }
      
      #mm-panel .mm-download-menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 140px;
        background: white;
        border: 1px solid var(--gray-200);
        border-radius: 8px;
        box-shadow: var(--shadow-lg);
        z-index: 1000;
        display: none;
        overflow: hidden;
      }
      
      #mm-panel .mm-download-menu.open {
        display: block;
      }
      
      #mm-panel .mm-download-menu-item {
        display: flex;
        align-items: center;
        padding: 10px 16px;
        font-size: 13px;
        color: var(--gray-700);
        cursor: pointer;
        transition: background 150ms ease;
        font-family: var(--font-family);
      }
      
      #mm-panel .mm-download-menu-item:hover {
        background: var(--gray-50);
        color: var(--gray-900);
      }
      
      #mm-panel .mm-download-menu-item.active {
        background: var(--primary-50);
        color: var(--primary-700);
        font-weight: 500;
      }
      
      #mm-panel .mm-download-menu-item:first-child {
        border-top-left-radius: 8px;
        border-top-right-radius: 8px;
      }
      
      #mm-panel .mm-download-menu-item:last-child {
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
      }
      
      #mm-panel .mm-btn {
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        border: 1px solid var(--gray-200);
        background: white;
        color: var(--gray-700);
        cursor: pointer;
        transition: all 200ms ease;
        font-family: var(--font-family);
        white-space: nowrap;
      }
      
      #mm-panel .mm-btn:hover:not(:disabled) {
        background: var(--gray-50);
        border-color: var(--gray-300);
        color: var(--gray-900);
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
      }
      
      #mm-panel .mm-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      
      #mm-panel .mm-btn-primary {
        background: var(--primary-500);
        color: white;
        border-color: var(--primary-500);
      }
      
      #mm-panel .mm-btn-primary:hover:not(:disabled) {
        background: var(--primary-600);
        border-color: var(--primary-600);
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }
      
      #mm-panel .mm-btn-primary:active:not(:disabled) {
        background: var(--primary-700);
        transform: translateY(0);
      }
      
      #mm-panel .mm-btn-icon {
        padding: 8px;
        min-width: 36px;
        width: 36px;
        height: 36px;
        font-size: 20px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      #mm-panel .mm-btn-icon:hover:not(:disabled) {
        background: var(--gray-100);
        color: var(--gray-900);
      }
      
      #mm-panel #mm-loader {
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-height: 0;
        background: white;
        padding: 40px 20px;
      }
      
      #mm-panel .mm-loader-content {
        width: 100%;
        max-width: 400px;
      }
      
      #mm-panel .mm-loader-text {
        color: var(--gray-700);
        font-size: 15px;
        font-weight: 500;
        font-family: var(--font-family);
        margin-bottom: 20px;
        text-align: center;
      }
      
      #mm-panel .mm-loader-stage {
        color: var(--gray-500);
        font-size: 13px;
        font-weight: 400;
        font-family: var(--font-family);
        margin-bottom: 12px;
        text-align: center;
        min-height: 18px;
      }
      
      #mm-panel .mm-progress-container {
        width: 100%;
        height: 8px;
        background: var(--gray-200);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
        position: relative;
      }
      
      #mm-panel .mm-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, var(--primary-500), var(--primary-400));
        border-radius: 4px;
        transition: width 0.3s ease;
        position: relative;
        overflow: hidden;
      }
      
      #mm-panel .mm-progress-bar::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.3),
          transparent
        );
        animation: mm-progress-shine 2s infinite;
      }
      
      @keyframes mm-progress-shine {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
      
      #mm-panel .mm-progress-percent {
        color: var(--gray-600);
        font-size: 12px;
        font-weight: 500;
        font-family: var(--font-family);
        text-align: center;
      }
      
      #mm-panel #mm-loader-error {
        display: none;
        color: var(--error);
        font-size: 13px;
        margin-top: 12px;
        padding: 12px 16px;
        background: var(--error-bg);
        border: 1px solid var(--error-border);
        border-radius: 8px;
        max-width: 400px;
        text-align: center;
        font-family: var(--font-family);
        line-height: 1.5;
      }
      
      #mm-panel #mm-elixir {
        flex: 1;
        min-height: 0;
        background: white;
      }
      
      #mm-panel .mm-header-buttons {
        position: relative;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      
      #mm-panel .mm-info-popup {
        display: none;
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        z-index: 1001;
        min-width: 320px;
        max-width: 400px;
      }
      
      #mm-panel .mm-info-popup.show {
        display: block;
      }
      
      #mm-panel .mm-info-popup-content {
        background: white;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--gray-200);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: mm-popup-fade-in 0.2s ease-out;
        position: relative;
      }
      
      #mm-panel .mm-info-popup-content::before {
        content: '';
        position: absolute;
        top: -6px;
        right: 20px;
        width: 12px;
        height: 12px;
        background: white;
        border-left: 1px solid var(--gray-200);
        border-top: 1px solid var(--gray-200);
        transform: rotate(45deg);
      }
      
      @keyframes mm-popup-fade-in {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      
      #mm-panel .mm-info-popup-header {
        padding: 14px 16px;
        border-bottom: 1px solid var(--gray-100);
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--gray-50);
      }
      
      #mm-panel .mm-info-popup-header strong {
        color: var(--gray-900);
        font-size: 14px;
        font-weight: 600;
        font-family: var(--font-family);
        letter-spacing: -0.01em;
      }
      
      #mm-panel .mm-info-popup-close {
        background: none;
        border: none;
        font-size: 20px;
        line-height: 1;
        color: var(--gray-400);
        cursor: pointer;
        padding: 4px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      
      #mm-panel .mm-info-popup-close:hover {
        background: var(--gray-100);
        color: var(--gray-700);
      }
      
      #mm-panel .mm-info-popup-body {
        padding: 12px;
        font-family: var(--font-family);
      }
      
      #mm-panel .mm-info-tip {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        margin-bottom: 4px;
        border-radius: 8px;
        background: var(--gray-50);
        transition: all 0.15s ease;
      }
      
      #mm-panel .mm-info-tip:last-child {
        margin-bottom: 0;
      }
      
      #mm-panel .mm-info-tip:hover {
        background: var(--primary-50);
      }
      
      #mm-panel .mm-info-tip-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        color: var(--primary-600);
        margin-top: 2px;
      }
      
      #mm-panel .mm-info-tip-content {
        flex: 1;
        min-width: 0;
      }
      
      #mm-panel .mm-info-tip strong {
        color: var(--gray-900);
        font-weight: 600;
        font-size: 13px;
        display: block;
        margin-bottom: 4px;
        letter-spacing: -0.01em;
      }
      
      #mm-panel .mm-info-tip-text {
        color: var(--gray-600);
        font-size: 12px;
        line-height: 1.5;
      }
      
      #mm-panel .mm-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        width: 4px;
        height: 100%;
        background: transparent;
        cursor: ew-resize;
        z-index: 10;
        transition: background 200ms ease;
      }
      
      #mm-panel .mm-resize-handle:hover {
        background: var(--primary-500);
      }
      
      #mm-panel .mm-resize-handle:active {
        background: var(--primary-600);
      }
      
      #mm-panel .mm-resize-handle::before {
        content: '';
        position: absolute;
        left: -10px;
        top: 0;
        width: 20px;
        height: 100%;
        background: transparent;
        cursor: ew-resize;
      }
      
      @keyframes mm-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  panel = document.createElement("div");
  panel.id = "mm-panel";
  panel.innerHTML = `
    <div class="mm-resize-handle" id="mm-resize-handle" title="Drag to resize"></div>
    <div class="mm-header">
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="${chrome.runtime.getURL('img/icon.png')}" alt="Logo" style="width: 24px; height: 24px; display: block;">
        <strong>Mind Map Generator</strong>
      </div>
      <div class="mm-header-buttons">
        <div class="mm-download-dropdown" id="mm-download-dropdown">
          <button class="mm-download-btn" id="mm-download-btn">
            <span id="mm-download-text">Download PNG</span>
            <span class="mm-dropdown-arrow"></span>
          </button>
          <div class="mm-download-menu" id="mm-download-menu">
            <div class="mm-download-menu-item active" data-format="png">PNG</div>
            <div class="mm-download-menu-item" data-format="svg">SVG</div>
          </div>
        </div>
        <div style="position: relative;">
          <button id="mm-info-btn" class="mm-btn mm-btn-icon" title="Show tips">ℹ</button>
          <div class="mm-info-popup" id="mm-info-popup">
          <div class="mm-info-popup-content">
            <div class="mm-info-popup-header">
              <strong>Tips</strong>
              <button class="mm-info-popup-close" id="mm-info-popup-close">×</button>
            </div>
            <div class="mm-info-popup-body">
              <div class="mm-info-tip">
                <div class="mm-info-tip-icon">✏️</div>
                <div class="mm-info-tip-content">
                  <strong>Edit nodes</strong>
                  <div class="mm-info-tip-text">Right-click on nodes to edit or delete</div>
                </div>
              </div>
              <div class="mm-info-tip">
                <div class="mm-info-tip-icon">🖱️</div>
                <div class="mm-info-tip-content">
                  <strong>Pan map</strong>
                  <div class="mm-info-tip-text">Hold right mouse button and drag to move the map</div>
                </div>
              </div>
              <div class="mm-info-tip">
                <div class="mm-info-tip-icon">🔍</div>
                <div class="mm-info-tip-content">
                  <strong>Zoom</strong>
                  <div class="mm-info-tip-text">Use Ctrl + mouse wheel to zoom in/out</div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
        <button id="mm-close" class="mm-btn mm-btn-icon" title="Close">×</button>
      </div>
    </div>
    <div id="mm-loader">
      <div class="mm-loader-content">
        <div class="mm-loader-text">Generating mind map...</div>
        <div class="mm-loader-stage"></div>
        <div class="mm-progress-container">
          <div class="mm-progress-bar" id="mm-progress-bar" style="width: 0%"></div>
        </div>
        <div class="mm-progress-percent" id="mm-progress-percent">0%</div>
        <div id="mm-loader-error"></div>
      </div>
    </div>
    <div id="mm-elixir"></div>
  `;

  // Calculate sidebar width - try to restore from storage, otherwise use 50vw
  const viewportWidth = window.innerWidth;
  let sidebarWidth = Math.max(400, Math.min(1200, viewportWidth * 0.5));
  
  // Try to restore saved width
  try {
    const saved = localStorage.getItem("mm-sidebar-width");
    if (saved) {
      const savedWidth = parseInt(saved, 10);
      if (savedWidth >= 400 && savedWidth <= 1200) {
        sidebarWidth = savedWidth;
      }
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  Object.assign(panel.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${sidebarWidth}px`,
    height: "100vh",
    background: "#fff",
    zIndex: 2147483647,
    boxShadow: "-4px 0 20px rgba(0, 0, 0, 0.1), -2px 0 8px rgba(0, 0, 0, 0.06)",
    display: "flex",
    flexDirection: "column",
    transition: "width 200ms ease"
  });

  // Apply scale transform to page (like browser devtools console)
  // This preserves layout while scaling the page to fit
  // Sidebar is excluded from scaling because it's appended to documentElement, not body
  const applyPageScale = (width) => {
    const viewportWidth = window.innerWidth;
    const availableWidth = viewportWidth - width;
    const scaleFactor = Math.max(0.3, Math.min(1, availableWidth / viewportWidth)); // Limit scale between 0.3 and 1
    
    // Check if this is a PDF page
    const isPdf = window.PdfExtractor && window.PdfExtractor.isPdfTab && window.PdfExtractor.isPdfTab();
    
    const body = document.body;
    const html = document.documentElement;
    const viewportHeight = window.innerHeight;
    
    if (!panel._scaleApplied) {
      // Store original values
      panel._originalBodyTransform = body.style.transform || "";
      panel._originalBodyTransformOrigin = body.style.transformOrigin || "";
      panel._originalBodyWidth = body.style.width || "";
      panel._originalBodyHeight = body.style.height || "";
      panel._originalBodyMinHeight = body.style.minHeight || "";
      panel._originalBodyMaxHeight = body.style.maxHeight || "";
      panel._originalHtmlHeight = html.style.height || "";
      panel._originalHtmlMinHeight = html.style.minHeight || "";
      panel._scaleApplied = true;
    }
    
    if (isPdf) {
      // For PDF pages, scale body and ensure full height
      // IMPORTANT: When using transform: scale(), the visual height becomes height * scaleFactor
      // So we need to set height to viewportHeight / scaleFactor to get full visual height
      const scaledHeight = viewportHeight / scaleFactor;
      // For width, we use availableWidth (viewportWidth - sidebar width) divided by scaleFactor
      // This ensures the scaled width fits exactly in the available space
      const scaledWidth = availableWidth / scaleFactor;
      
      body.style.transition = "transform 150ms ease-out";
      body.style.transform = `scale(${scaleFactor})`;
      body.style.transformOrigin = "top left";
      body.style.width = `${scaledWidth}px`;
      body.style.height = `${scaledHeight}px`;
      body.style.minHeight = `${scaledHeight}px`;
      body.style.maxHeight = `${scaledHeight}px`;
      body.style.overflow = "hidden";
      body.style.margin = "0";
      body.style.padding = "0";
      
      // Also set html height to match
      html.style.height = `${scaledHeight}px`;
      html.style.minHeight = `${scaledHeight}px`;
      html.style.overflow = "hidden";
      html.style.margin = "0";
      html.style.padding = "0";
      
      // Find and scale PDF viewer elements directly
      const pdfViewers = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf"]');
      pdfViewers.forEach(pdfViewer => {
        pdfViewer.style.width = `${scaledWidth}px`;
        pdfViewer.style.height = `${scaledHeight}px`;
        pdfViewer.style.minHeight = `${scaledHeight}px`;
        pdfViewer.style.maxHeight = `${scaledHeight}px`;
      });
      
      // Also handle canvas elements (PDF.js)
      const pdfCanvases = document.querySelectorAll('canvas');
      pdfCanvases.forEach(canvas => {
        const parent = canvas.parentElement;
        if (parent) {
          parent.style.width = `${scaledWidth}px`;
          parent.style.height = `${scaledHeight}px`;
          parent.style.minHeight = `${scaledHeight}px`;
          parent.style.maxHeight = `${scaledHeight}px`;
        }
      });
    } else {
      // For regular pages, scale only body
      body.style.transition = "transform 150ms ease-out";
      body.style.transform = `scale(${scaleFactor})`;
      body.style.transformOrigin = "top left";
      body.style.width = `${viewportWidth}px`;
      // Don't set height for regular pages to allow natural flow
    }
    
    // Don't scale html - sidebar is appended to documentElement, not body
    // This way sidebar stays normal size while page content scales
  };
  
  // Apply initial scale
  applyPageScale(sidebarWidth);
  panel._applyPageScale = applyPageScale;

  // Resize handle functionality
  const resizeHandle = panel.querySelector("#mm-resize-handle");
  panel._isResizing = false;
  panel._startX = 0;
  panel._startWidth = 0;
  
  panel._updateWidth = (newWidth) => {
    const minWidth = 400;
    const maxWidth = Math.min(1200, window.innerWidth * 0.8);
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    
    panel.style.width = `${constrainedWidth}px`;
    
    // Update page scale in real-time
    if (panel._applyPageScale) {
      panel._applyPageScale(constrainedWidth);
    }
    
    // Save to localStorage (throttled to avoid too many writes)
    if (!panel._saveTimeout) {
      panel._saveTimeout = setTimeout(() => {
        try {
          localStorage.setItem("mm-sidebar-width", constrainedWidth.toString());
        } catch (e) {
          // Ignore localStorage errors
        }
        panel._saveTimeout = null;
      }, 100);
    }
    
    return constrainedWidth;
  };
  
  panel._mouseMoveHandler = (e) => {
    if (!panel._isResizing) return;
    // Always use clientX from the event, even if cursor is over scaled PDF
    e.preventDefault();
    e.stopPropagation();
    // Calculate difference: positive when dragging left (increasing width), negative when dragging right (decreasing width)
    const diff = panel._startX - e.clientX;
    const newWidth = panel._startWidth + diff;
    panel._updateWidth(newWidth);
    return false;
  };
  
  panel._mouseUpHandler = (e) => {
    if (panel._isResizing) {
      // Make sure to update width one more time on mouseup
      if (e && e.clientX !== undefined) {
        const diff = panel._startX - e.clientX;
        const newWidth = panel._startWidth + diff;
        panel._updateWidth(newWidth);
      }
      panel._isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.onselectstart = null;
    }
    return false;
  };
  
  // Store references to window-level handlers for cleanup
  let windowMouseMoveHandler = null;
  let windowMouseUpHandler = null;
  let resizeOverlay = null;
  
  const createResizeOverlay = () => {
    // Create an invisible overlay that covers the entire viewport to capture mouse events
    const overlay = document.createElement("div");
    overlay.id = "mm-resize-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: transparent;
      z-index: 2147483646;
      cursor: ew-resize;
      pointer-events: auto;
    `;
    document.body.appendChild(overlay);
    return overlay;
  };
  
  const removeResizeOverlay = () => {
    if (resizeOverlay) {
      resizeOverlay.remove();
      resizeOverlay = null;
    }
  };
  
  const disablePdfPointerEvents = () => {
    // Disable pointer events on PDF elements to prevent them from intercepting mouse events
    const pdfElements = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf"]');
    pdfElements.forEach(el => {
      el.style.pointerEvents = 'none';
    });
  };
  
  const enablePdfPointerEvents = () => {
    // Re-enable pointer events on PDF elements
    const pdfElements = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf"]');
    pdfElements.forEach(el => {
      el.style.pointerEvents = '';
    });
  };
  
  resizeHandle.addEventListener("mousedown", (e) => {
    panel._isResizing = true;
    panel._startX = e.clientX;
    panel._startWidth = parseInt(panel.style.width) || sidebarWidth;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    // Prevent text selection during resize
    document.onselectstart = () => false;
    e.preventDefault();
    e.stopPropagation();
    
    // Create overlay to capture mouse events over PDF
    resizeOverlay = createResizeOverlay();
    
    // Disable pointer events on PDF elements
    disablePdfPointerEvents();
    
    // Create window-level handlers that will capture events even over PDF
    windowMouseMoveHandler = (ev) => {
      if (!panel._isResizing) return;
      ev.preventDefault();
      ev.stopPropagation();
      const diff = panel._startX - ev.clientX;
      const newWidth = panel._startWidth + diff;
      panel._updateWidth(newWidth);
      return false;
    };
    
    windowMouseUpHandler = (ev) => {
      if (panel._isResizing) {
        ev.preventDefault();
        ev.stopPropagation();
        // Update width one final time
        const diff = panel._startX - ev.clientX;
        const newWidth = panel._startWidth + diff;
        panel._updateWidth(newWidth);
        // Clean up
        panel._isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.onselectstart = null;
        // Remove overlay
        removeResizeOverlay();
        // Re-enable PDF pointer events
        enablePdfPointerEvents();
        // Remove window-level listeners
        window.removeEventListener("mousemove", windowMouseMoveHandler, true);
        window.removeEventListener("mouseup", windowMouseUpHandler, true);
        windowMouseMoveHandler = null;
        windowMouseUpHandler = null;
      }
      return false;
    };
    
    // Add window-level listeners with capture phase to catch events before PDF viewer
    window.addEventListener("mousemove", windowMouseMoveHandler, true);
    window.addEventListener("mouseup", windowMouseUpHandler, true);
    
    return false;
  });
  
  // Also handle mouseleave on window to ensure mouseup is caught
  window.addEventListener("mouseleave", (e) => {
    if (panel._isResizing && windowMouseUpHandler) {
      // Mouse left the window, end resize
      windowMouseUpHandler(e);
    }
  });
  
  // Handle window resize (only adjust if sidebar is too wide)
  panel._resizeHandler = () => {
    const currentWidth = parseInt(panel.style.width) || sidebarWidth;
    const maxWidth = Math.min(1200, window.innerWidth * 0.8);
    if (currentWidth > maxWidth) {
      panel._updateWidth(maxWidth);
    } else {
      // Update scale when window resizes
      if (panel._applyPageScale) {
        panel._applyPageScale(currentWidth);
      }
    }
  };
  window.addEventListener("resize", panel._resizeHandler);

  // Info popup handlers
  const infoBtn = panel.querySelector("#mm-info-btn");
  const infoPopup = panel.querySelector("#mm-info-popup");
  const infoPopupClose = panel.querySelector("#mm-info-popup-close");
  
  console.log("[MM] Info button:", infoBtn);
  console.log("[MM] Info popup:", infoPopup);
  
  if (infoBtn && infoPopup) {
    infoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log("[MM] Info button clicked");
      const isOpen = infoPopup.classList.contains("show");
      if (isOpen) {
        infoPopup.classList.remove("show");
        console.log("[MM] Popup closed");
      } else {
        infoPopup.classList.add("show");
        console.log("[MM] Popup opened");
      }
    });
  } else {
    console.error("[MM] Info button or popup not found!", { infoBtn, infoPopup });
  }
  
  if (infoPopupClose && infoPopup) {
    infoPopupClose.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      infoPopup.classList.remove("show");
    });
  }
  
  // Close popup when clicking outside
  const closePopupOnOutsideClick = (e) => {
    if (infoPopup && infoPopup.classList.contains("show")) {
      const clickedInside = infoPopup.contains(e.target) || infoBtn.contains(e.target);
      if (!clickedInside) {
        infoPopup.classList.remove("show");
      }
    }
  };
  
  // Use capture phase to catch clicks before they reach other elements
  document.addEventListener("click", closePopupOnOutsideClick, true);
  
  // Store handler for cleanup
  panel._closePopupHandler = closePopupOnOutsideClick;
  
  panel.querySelector("#mm-close").onclick = () => {
    // Restore original transform and width
    if (panel._scaleApplied) {
      const body = document.body;
      const html = document.documentElement;
      
      body.style.transition = "";
      body.style.transform = panel._originalBodyTransform || "";
      body.style.transformOrigin = panel._originalBodyTransformOrigin || "";
      body.style.width = panel._originalBodyWidth || "";
      body.style.height = panel._originalBodyHeight || "";
      body.style.minHeight = panel._originalBodyMinHeight || "";
      body.style.maxHeight = panel._originalBodyMaxHeight || "";
      body.style.overflow = "";
      
      html.style.height = panel._originalHtmlHeight || "";
      html.style.minHeight = panel._originalHtmlMinHeight || "";
      html.style.overflow = "";
      
      // Reset PDF viewer elements
      const pdfViewers = document.querySelectorAll('embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf"]');
      pdfViewers.forEach(pdfViewer => {
        pdfViewer.style.width = "";
        pdfViewer.style.height = "";
        pdfViewer.style.minHeight = "";
        pdfViewer.style.maxHeight = "";
      });
      
      const pdfCanvases = document.querySelectorAll('canvas');
      pdfCanvases.forEach(canvas => {
        const parent = canvas.parentElement;
        if (parent) {
          parent.style.width = "";
          parent.style.height = "";
          parent.style.minHeight = "";
          parent.style.maxHeight = "";
        }
      });
    }
    // Remove resize handler
    if (panel._resizeHandler) {
      window.removeEventListener("resize", panel._resizeHandler);
    }
    // Remove mouse event listeners
    if (panel._mouseMoveHandler) {
      document.removeEventListener("mousemove", panel._mouseMoveHandler);
    }
    if (panel._mouseUpHandler) {
      document.removeEventListener("mouseup", panel._mouseUpHandler);
    }
    // Remove popup click handler
    if (panel._closePopupHandler) {
      document.removeEventListener("click", panel._closePopupHandler, true);
    }
    panel.remove();
    // Remove from storage on close
    chrome.storage.local.remove(["sidebarOpen", "sidebarTabId", "sidebarUrl"]);
  };
  // Append to documentElement instead of body to avoid scaling issues
  document.documentElement.appendChild(panel);
  
  // Attach link interceptor (will be available after utils.js loads)
  setTimeout(() => {
    if (window.ContentUtils && window.ContentUtils.attachMmLinkInterceptor) {
      window.ContentUtils.attachMmLinkInterceptor(panel);
    }
  }, 0);
  
  return panel;
}

function showLoader() {
  const panel = ensureMindmapSidebar();
  const loader = panel.querySelector("#mm-loader");
  const elixir = panel.querySelector("#mm-elixir");
  const errorDiv = panel.querySelector("#mm-loader-error");
  const progressBar = panel.querySelector("#mm-progress-bar");
  const progressPercent = panel.querySelector("#mm-progress-percent");
  const stageText = panel.querySelector(".mm-loader-stage");
  
  if (loader) {
    loader.style.display = "flex";
    errorDiv.style.display = "none";
    errorDiv.textContent = "";
    // Reset progress
    if (progressBar) progressBar.style.width = "0%";
    if (progressPercent) progressPercent.textContent = "0%";
    if (stageText) stageText.textContent = "";
  }
  if (elixir) {
    elixir.style.display = "none";
  }
  
  return panel;
}

function updateProgress(percent, stage) {
  const panel = document.getElementById("mm-panel");
  if (!panel) return;
  
  const progressBar = panel.querySelector("#mm-progress-bar");
  const progressPercent = panel.querySelector("#mm-progress-percent");
  const stageText = panel.querySelector(".mm-loader-stage");
  
  const clampedPercent = Math.max(0, Math.min(100, percent));
  
  if (progressBar) {
    progressBar.style.width = `${clampedPercent}%`;
  }
  if (progressPercent) {
    progressPercent.textContent = `${Math.round(clampedPercent)}%`;
  }
  if (stageText && stage) {
    stageText.textContent = stage;
  }
}

function hideLoader(error) {
  const panel = document.getElementById("mm-panel");
  if (!panel) {
    console.warn("[MM] hideLoader: panel not found");
    return;
  }
  
  const loader = panel.querySelector("#mm-loader");
  const elixir = panel.querySelector("#mm-elixir");
  const errorDiv = panel.querySelector("#mm-loader-error");
  
  if (error && errorDiv) {
    errorDiv.style.display = "block";
    errorDiv.textContent = error;
    if (loader) {
      loader.style.display = "flex";
    }
    if (elixir) {
      elixir.style.display = "none";
    }
  } else {
    if (loader) {
      loader.style.display = "none";
    }
    if (elixir) {
      elixir.style.display = "block";
    }
    if (errorDiv) {
      errorDiv.style.display = "none";
      errorDiv.textContent = "";
    }
  }
}

// Restore sidebar when switching between tabs
async function restoreSidebarIfNeeded() {
  try {
    const result = await chrome.storage.local.get(["sidebarOpen", "sidebarTabId", "sidebarUrl"]);
    if (result.sidebarOpen && result.sidebarUrl === window.location.href) {
      // Restore sidebar with loader if it was open on this page
      const panel = ensureMindmapSidebar();
      showLoader();
      // Ensure scale is applied when restoring
      if (panel) {
        const currentWidth = parseInt(panel.style.width) || Math.max(400, Math.min(1200, window.innerWidth * 0.5));
        if (!panel._scaleApplied && panel._applyPageScale) {
          panel._applyPageScale(currentWidth);
        } else if (panel._applyPageScale) {
          // Just update scale
          panel._applyPageScale(currentWidth);
        }
        
        // Re-attach resize handler if not already attached
        if (!panel._resizeHandler) {
          panel._resizeHandler = () => {
            const currentWidth = parseInt(panel.style.width) || 600;
            const maxWidth = Math.min(1200, window.innerWidth * 0.8);
            if (currentWidth > maxWidth) {
              panel._updateWidth(maxWidth);
            } else {
              // Update scale when window resizes
              if (panel._applyPageScale) {
                panel._applyPageScale(currentWidth);
              }
            }
          };
          window.addEventListener("resize", panel._resizeHandler);
        }
      }
    }
  } catch (e) {
    console.warn("[MM] Failed to restore sidebar:", e);
  }
}

// Restore sidebar on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", restoreSidebarIfNeeded);
} else {
  restoreSidebarIfNeeded();
}

// Export to global object
window.Sidebar = {
  ensureMindmapSidebar,
  showLoader,
  hideLoader,
  updateProgress,
  restoreSidebarIfNeeded
};


