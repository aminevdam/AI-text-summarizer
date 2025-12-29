// Rendering mind map using MindElixir

let mindInstance = null;
let lastMindmapMarkdown = "";

function markdownToMindElixir(markdown) {
  const lines = markdown.split(/\r?\n/);

  // root node
  const root = { id: window.ContentUtils.uid(), topic: "Mind Map", root: true, children: [] };

  // stack: [{level, node}] level: 0 root, 1 #, 2 ##, 3 ###, 4 bullet
  let stack = [{ level: 0, node: root }];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length; // 1..3
      const title = h[2].trim();

      if (level === 1) {
        root.topic = title;
        continue;
      }

      const node = { id: window.ContentUtils.uid(), topic: title, children: [] };

      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack[stack.length - 1].node.children.push(node);
      stack.push({ level, node });
      continue;
    }

    if (line.startsWith("- ")) {
      const text = window.ContentUtils.stripMdLinks(line.slice(2));
      if (!text) continue;

      const link = window.ContentUtils.parseLeafLink(line);

      const leaf = { id: window.ContentUtils.uid(), topic: text, children: [] };
      if (link) leaf.hyperLink = link;

      // parent: последний заголовок или root
      while (stack.length && stack[stack.length - 1].level >= 4) stack.pop();
      stack[stack.length - 1].node.children.push(leaf);
      stack.push({ level: 4, node: leaf });
    }
  }

  // ВАЖНО: Mind Elixir init ждёт объект с nodeData
  return {
    nodeData: root,
    direction: 2,
    arrows: [],
    summaries: []
  };
}

/**
 * Converts MindElixir structure back to markdown
 */
function mindElixirToMarkdown(nodeData) {
  const lines = [];
  
  // Add first level header
  if (nodeData.topic && nodeData.topic !== "Mind Map") {
    lines.push(`# ${nodeData.topic}`);
    lines.push("");
  }
  
  // Рекурсивная функция для обхода узлов
  function traverseNode(node, level = 2) {
    if (!node || !node.children || node.children.length === 0) {
      return;
    }
    
    for (const child of node.children) {
      const topic = child.topic || "";
      if (!topic) continue;
      
      // Определяем уровень на основе структуры
      const hasHeaderChildren = child.children && child.children.some(c => 
        c.children && c.children.length > 0
      );
      
      const isHeader = hasHeaderChildren || 
                      (level <= 3 && child.children && child.children.length > 0 && topic.length < 100);
      
      if (isHeader) {
        const headerLevel = Math.min(level, 3);
        const headerPrefix = "#".repeat(headerLevel);
        lines.push(`${headerPrefix} ${topic}`);
        lines.push("");
        traverseNode(child, level + 1);
      } else {
        let leafText = `- ${topic}`;
        if (child.hyperLink) {
          const linkMatch = child.hyperLink.match(/mm:\/\/[^)]+/);
          if (linkMatch) {
            leafText += ` [${linkMatch[0]}]`;
          }
        }
        lines.push(leafText);
        
        if (child.children && child.children.length > 0) {
          traverseNode(child, level + 1);
        }
      }
    }
  }
  
  traverseNode(nodeData, 2);
  return lines.join("\n");
}

/**
 * Finds a node by ID in the data structure
 */
function findNodeById(root, targetId) {
  if (!root || !targetId) return null;
  
  if (root.id === targetId) {
    return root;
  }
  
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeById(child, targetId);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Finds a node by topic (name) in the data structure
 */
function findNodeByTopic(root, targetTopic) {
  if (!root || !targetTopic) return null;
  
  if (root.topic === targetTopic) {
    return root;
  }
  
  if (root.children) {
    for (const child of root.children) {
      const found = findNodeByTopic(child, targetTopic);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Clones a node without circular parent references
 */
function cloneNodeWithoutParent(node) {
  if (!node || typeof node !== 'object') return node;
  
  const cloned = {};
  
  for (const key in node) {
    if (key === 'parent') {
      continue;
    }
    
    if (key === 'children' && Array.isArray(node.children)) {
      cloned.children = node.children.map(child => cloneNodeWithoutParent(child));
    } else {
      cloned[key] = node[key];
    }
  }
  
  return cloned;
}

/**
 * Removes a node from MindElixir structure
 */
function removeNodeFromMindElixir(mind, node) {
  if (!node) {
    return false;
  }
  
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  
  let nodeObj = node;
  
  if (nodeObj.nodeObj && typeof nodeObj.nodeObj === 'object') {
    nodeObj = nodeObj.nodeObj;
  }
  
  if (!nodeObj || typeof nodeObj !== 'object') {
    return false;
  }
  
  if (!nodeObj.id && nodeObj.topic) {
    const found = findNodeByTopic(mind.nodeData, nodeObj.topic);
    if (found) {
      nodeObj = found;
    }
  }
  
  if (nodeObj.root) {
    return false;
  }
  
  function findParent(root, targetNode, parent = null) {
    if (root === targetNode || (root.id && targetNode.id && root.id === targetNode.id)) {
      return parent;
    }
    
    if (root.children) {
      for (const child of root.children) {
        if (child === targetNode || (child.id && targetNode.id && child.id === targetNode.id)) {
          return root;
        }
        const found = findParent(child, targetNode, root);
        if (found !== null) {
          return found;
        }
      }
    }
    
    return null;
  }
  
  const parent = findParent(mind.nodeData, nodeObj);
  if (!parent || !parent.children) {
    return false;
  }
  
  if (parent.root || parent === mind.nodeData) {
    alert("Error: Cannot delete a node that is a direct child of the root node.\n\nPlease select a deeper node to delete.");
    return false;
  }
  
  const index = parent.children.findIndex(child => 
    child === nodeObj || child.id === nodeObj.id
  );
  
  if (index !== -1) {
    if (!parent.children || parent.children.length === 0) {
      return false;
    }
    
    if (parent === mind.nodeData && parent.children.length === 1) {
      alert("Error: Cannot delete the last node in the mind map.");
      return false;
    }
    
    const backupChildren = [...parent.children];
    parent.children.splice(index, 1);
    
    if (!mind.nodeData || !mind.nodeData.children) {
      parent.children = backupChildren;
      alert("Error: Mind map structure is corrupted. Operation cancelled.");
      return false;
    }
    
    const cleanNodeData = cloneNodeWithoutParent(mind.nodeData);
    
    if (!cleanNodeData || !cleanNodeData.children || cleanNodeData.children.length === 0) {
      parent.children = backupChildren;
      alert("Error: Failed to create a valid copy of the structure. Operation cancelled.");
      return false;
    }
    
    try {
      if (mind.refresh && typeof mind.refresh === 'function') {
        mind.refresh(cleanNodeData);
      } else {
        mind.init({ nodeData: cleanNodeData });
      }
    } catch (e) {
      parent.children = backupChildren;
      alert("Error updating visualization. Changes cancelled.");
      return false;
    }
    
    const updatedMarkdown = mindElixirToMarkdown(cleanNodeData);
    lastMindmapMarkdown = updatedMarkdown;
    mind.nodeData = cleanNodeData;
    
    return true;
  } else {
    return false;
  }
}

function renderMindElixir(markdown) {
  console.log("[MM] renderMindElixir called, markdown length:", markdown?.length || 0);
  lastMindmapMarkdown = markdown || "";

  const panel = window.Sidebar.ensureMindmapSidebar();
  const mount = panel.querySelector("#mm-elixir");
  if (!mount) {
    console.error("[MM] mm-elixir element not found!");
    throw new Error("mm-elixir element not found");
  }
  
  mount.innerHTML = "";
  
  // Hide loader and show mind map
  window.Sidebar.hideLoader();
  mount.style.display = "block";

  const MindElixir = window.MindElixir;
  if (!MindElixir) {
    console.error("[MM] MindElixir not found on window");
    throw new Error("MindElixir not found on window");
  }

  console.log("[MM] Creating MindElixir instance");
  const mind = new MindElixir({
    el: mount,
    direction: MindElixir.RIGHT,
    draggable: false,
    contextMenu: true,
    toolBar: false,
    nodeMenu: true,
    overflowHidden: false
  });

  console.log("[MM] Converting markdown to MindElixir data");
  const data = markdownToMindElixir(markdown);
  console.log("[MM] Initializing MindElixir with data");
  mind.init(data);
  mindInstance = mind;
  console.log("[MM] MindElixir initialized successfully");
  
  // Handle node selection (for links only)
  mind.bus.addListener("selectNode", (node) => {
    const nodeObj = node?.nodeObj || node;
    const link = nodeObj?.hyperLink;
    if (link && typeof link === "string" && link.startsWith("mm://")) {
      window.ContentUtils.handleMmLink(link);
    }
  });
  
  // Handle node deletion (via built-in MindElixir menu)
  mind.bus.addListener("removeNode", (node) => {
    if (node && !node.root) {
      const updatedMarkdown = mindElixirToMarkdown(mind.nodeData);
      lastMindmapMarkdown = updatedMarkdown;
    }
  });
  
  // Also listen for structure changes to update markdown
  mind.bus.addListener("nodeChanged", () => {
    const updatedMarkdown = mindElixirToMarkdown(mind.nodeData);
    lastMindmapMarkdown = updatedMarkdown;
  });
  
  // Download dropdown menu
  let currentFormat = "png"; // Default format
  const downloadBtn = panel.querySelector("#mm-download-btn");
  const downloadText = panel.querySelector("#mm-download-text");
  const downloadMenu = panel.querySelector("#mm-download-menu");
  const menuItems = panel.querySelectorAll(".mm-download-menu-item");
  const dropdownArrow = downloadBtn?.querySelector(".mm-dropdown-arrow");
  
  // Update active format
  const updateActiveFormat = (format) => {
    currentFormat = format;
    const formatNames = { png: "PNG", svg: "SVG" };
    if (downloadText) {
      downloadText.textContent = `Download ${formatNames[format]}`;
    }
    menuItems.forEach(item => {
      if (item.dataset.format === format) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });
  };
  
  // Initialize default format (PNG)
  updateActiveFormat("png");
  
  // Toggle dropdown menu (for arrow click)
  const toggleDropdown = (e) => {
    e.stopPropagation();
    if (downloadBtn && downloadMenu) {
      downloadBtn.classList.toggle("open");
      downloadMenu.classList.toggle("open");
    }
  };
  
  // Setup dropdown arrow click
  if (dropdownArrow) {
    dropdownArrow.onclick = toggleDropdown;
    dropdownArrow.style.cursor = "pointer";
  }
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (downloadBtn && downloadMenu && 
        !downloadBtn.contains(e.target) && 
        !downloadMenu.contains(e.target)) {
      downloadBtn.classList.remove("open");
      downloadMenu.classList.remove("open");
    }
  });
  
  // Handle menu item clicks
  menuItems.forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      const format = item.dataset.format;
      updateActiveFormat(format);
      if (downloadBtn && downloadMenu) {
        downloadBtn.classList.remove("open");
        downloadMenu.classList.remove("open");
      }
    };
  });
  
  // Export functions
  const exportSvg = async () => {
    if (!mindInstance?.exportSvg) throw new Error("exportSvg not available");
    const blob = await mindInstance.exportSvg(false);
    window.ContentUtils.downloadBlob("mindmap.svg", blob);
  };
  
  const exportPng = async () => {
    if (!mindInstance?.exportSvg) throw new Error("exportSvg not available");
    const svgBlob = await mindInstance.exportSvg(false);
    const svgText = await svgBlob.text();
    
    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    
    // Get SVG dimensions
    const width = parseInt(svgElement.getAttribute("width")) || parseInt(svgElement.viewBox?.baseVal?.width) || 800;
    const height = parseInt(svgElement.getAttribute("height")) || parseInt(svgElement.viewBox?.baseVal?.height) || 600;
    
    // Convert SVG to data URL to avoid CORS issues
    const svgDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    
    // Create image from SVG data URL
    const img = new Image();
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        try {
          // Use scale for better quality
          const scale = 2; // 2x for better quality
          const canvas = document.createElement("canvas");
          canvas.width = width * scale;
          canvas.height = height * scale;
          const ctx = canvas.getContext("2d");
          
          // Fill white background
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw image scaled
          ctx.drawImage(img, 0, 0, width * scale, height * scale);
          
          canvas.toBlob((blob) => {
            if (blob) {
              window.ContentUtils.downloadBlob("mindmap.png", blob);
              resolve();
            } else {
              reject(new Error("Failed to create PNG blob"));
            }
          }, "image/png");
        } catch (err) {
          reject(new Error("Failed to render PNG: " + (err?.message || err)));
        }
      };
      
      img.onerror = (err) => {
        reject(new Error("Failed to load SVG image: " + (err?.message || err)));
      };
      
      // Set crossOrigin to anonymous to avoid CORS issues
      img.crossOrigin = "anonymous";
      img.src = svgDataUrl;
    });
  };
  
  // Download function - calls appropriate export based on current format
  const performDownload = async () => {
    try {
      if (currentFormat === "svg") {
        await exportSvg();
      } else if (currentFormat === "png") {
        await exportPng();
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to download ${currentFormat.toUpperCase()}: ${err?.message || err}`);
    }
  };
  
  // Handle download button click (download with current format)
  // Click on button text downloads, click on arrow toggles menu
  if (downloadBtn && downloadText) {
    // Single handler for button click
    downloadBtn.onclick = async (e) => {
      // If clicking arrow, toggle menu
      if (e.target === dropdownArrow || dropdownArrow?.contains(e.target)) {
        toggleDropdown(e);
        return;
      }
      // If clicking text or button area, download
      e.stopPropagation();
      await performDownload();
    };
    
    // Make text clickable
    downloadText.style.cursor = "pointer";
  }
}

// Export to global object
window.MindMapRenderer = {
  renderMindElixir,
  markdownToMindElixir,
  mindElixirToMarkdown,
  removeNodeFromMindElixir
};

