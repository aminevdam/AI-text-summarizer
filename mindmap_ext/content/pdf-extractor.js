// Извлечение текста из PDF

function isPdfTab() {
  const ct = (document.contentType || "").toLowerCase();
  if (ct.includes("pdf")) return true;
  return location.pathname.toLowerCase().endsWith(".pdf") || location.href.toLowerCase().includes(".pdf");
}

function initPdfJs() {
  if (!window.pdfjsLib) throw new Error("pdfjsLib not loaded");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.js");
}

/**
 * Группирует элементы PDF в строки по Y координате
 */
function groupItemsIntoLines(items) {
  const lines = [];
  const lineMap = new Map(); // Y координата -> массив элементов

  for (const item of items) {
    if (!item.str || !item.transform) continue;
    
    // transform: [a, b, c, d, e, f]
    // e, f - координаты, a, d - масштаб
    const y = item.transform[5]; // f - Y координата
    const height = item.height || 0;
    
    // Округляем Y для группировки близких строк
    const yKey = Math.round(y * 10) / 10;
    
    if (!lineMap.has(yKey)) {
      lineMap.set(yKey, []);
    }
    lineMap.get(yKey).push({
      ...item,
      x: item.transform[4], // e - X координата
      y: y,
      height: height
    });
  }

  // Сортируем строки по Y (сверху вниз)
  const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);
  
  for (const y of sortedY) {
    const items = lineMap.get(y);
    // Сортируем элементы в строке по X (слева направо)
    items.sort((a, b) => a.x - b.x);
    
    const lineText = items.map(it => it.str).join("").trim();
    if (lineText) {
      // Определяем средний размер шрифта и стиль строки
      const avgHeight = items.reduce((sum, it) => sum + (it.height || 0), 0) / items.length;
      const fontNames = items.map(it => it.fontName || "").filter(Boolean);
      const dominantFont = fontNames.length > 0 ? fontNames[0] : "";
      
      lines.push({
        text: lineText,
        y: y,
        height: avgHeight,
        fontName: dominantFont,
        items: items,
        isBold: dominantFont.toLowerCase().includes("bold") || 
                dominantFont.toLowerCase().includes("black"),
        fontSize: avgHeight
      });
    }
  }

  return lines;
}

/**
 * Определяет тип блока по характеристикам
 */
function detectBlockType(line, allLines, index) {
  const text = line.text.trim();
  const fontSize = line.fontSize;
  
  // Определяем средний размер шрифта для документа
  const allFontSizes = allLines.map(l => l.fontSize).filter(Boolean);
  const avgFontSize = allFontSizes.length > 0 
    ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length 
    : 12;
  
  // Заголовки обычно крупнее обычного текста
  const isLargeFont = fontSize > avgFontSize * 1.2;
  const isVeryLargeFont = fontSize > avgFontSize * 1.5;
  
  // Проверка на заголовок
  if (isVeryLargeFont || (isLargeFont && line.isBold)) {
    // Определяем уровень заголовка
    if (fontSize > avgFontSize * 2) return { type: "header", level: 1 };
    if (fontSize > avgFontSize * 1.5) return { type: "header", level: 2 };
    return { type: "header", level: 3 };
  }
  
  // Проверка на список
  const listPattern = /^[\s]*[•\-\*\d+\.\)]\s+/;
  if (listPattern.test(text)) {
    return { type: "list", level: 0 };
  }
  
  // Проверка на короткую строку (возможно подзаголовок)
  if (text.length < 100 && isLargeFont) {
    return { type: "header", level: 3 };
  }
  
  // Обычный параграф
  return { type: "paragraph", level: 0 };
}

/**
 * Определяет нумерацию раздела из текста
 */
function extractSectionNumber(text) {
  // Паттерны для нумерации: "1.1", "1.1.1", "Глава 1", "Раздел 2.3" и т.д.
  const patterns = [
    /^[\s]*(\d+\.\d+(?:\.\d+)*)/,  // 1.1, 1.1.1
    /^[\s]*Глава\s+(\d+)/i,        // Глава 1
    /^[\s]*Раздел\s+(\d+(?:\.\d+)*)/i,  // Раздел 1.1
    /^[\s]*(\d+)[\.\)]\s+/,         // 1. или 1)
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Определяет стиль блока на основе шрифта
 */
function determineStyle(fontName, isBold, fontSize, avgFontSize) {
  const styles = [];
  
  if (isBold || (fontName && fontName.toLowerCase().includes("bold"))) {
    styles.push("bold");
  }
  
  if (fontName && fontName.toLowerCase().includes("italic")) {
    styles.push("italic");
  }
  
  if (fontSize > avgFontSize * 1.3) {
    styles.push("large");
  }
  
  return styles.length > 0 ? styles.join(",") : "normal";
}

/**
 * Группирует строки в логические блоки
 */
function groupLinesIntoBlocks(lines) {
  const blocks = [];
  let currentBlock = null;
  
  // Вычисляем средний размер шрифта для определения стилей
  const allFontSizes = lines.map(l => l.fontSize).filter(Boolean);
  const avgFontSize = allFontSizes.length > 0 
    ? allFontSizes.reduce((a, b) => a + b, 0) / allFontSizes.length 
    : 12;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const blockType = detectBlockType(line, lines, i);
    
    // Определяем расстояние до предыдущей строки
    const prevLine = i > 0 ? lines[i - 1] : null;
    const lineGap = prevLine ? Math.abs(prevLine.y - line.y) : Infinity;
    const avgLineHeight = lines.reduce((sum, l) => sum + l.height, 0) / lines.length;
    const isNewBlock = lineGap > avgLineHeight * 1.5; // Большой отступ = новый блок
    
    // Если это заголовок или большой отступ - начинаем новый блок
    if (blockType.type === "header" || isNewBlock || !currentBlock) {
      // Сохраняем предыдущий блок
      if (currentBlock && currentBlock.text.trim()) {
        blocks.push(currentBlock);
      }
      
      // Определяем метаданные для нового блока
      const sectionNumber = extractSectionNumber(line.text);
      const style = determineStyle(line.fontName, line.isBold, line.fontSize, avgFontSize);
      
      // Создаём новый блок
      currentBlock = {
        type: blockType.type,
        level: blockType.level,
        text: line.text,
        page: null, // будет установлено позже
        lines: [line],
        // Метаданные структуры
        fontSize: line.fontSize,
        style: style,
        sectionNumber: sectionNumber,
        fontName: line.fontName
      };
    } else {
      // Продолжаем текущий блок
      if (currentBlock.type === blockType.type || blockType.type === "paragraph") {
        currentBlock.text += " " + line.text;
        currentBlock.lines.push(line);
        // Обновляем метаданные (берем средние значения)
        const allFontSizesInBlock = currentBlock.lines.map(l => l.fontSize);
        currentBlock.fontSize = allFontSizesInBlock.reduce((a, b) => a + b, 0) / allFontSizesInBlock.length;
      } else {
        // Разный тип - начинаем новый блок
        if (currentBlock && currentBlock.text.trim()) {
          blocks.push(currentBlock);
        }
        
        const sectionNumber = extractSectionNumber(line.text);
        const style = determineStyle(line.fontName, line.isBold, line.fontSize, avgFontSize);
        
        currentBlock = {
          type: blockType.type,
          level: blockType.level,
          text: line.text,
          page: null,
          lines: [line],
          fontSize: line.fontSize,
          style: style,
          sectionNumber: sectionNumber,
          fontName: line.fontName
        };
      }
    }
  }
  
  // Добавляем последний блок
  if (currentBlock && currentBlock.text.trim()) {
    blocks.push(currentBlock);
  }
  
  return blocks;
}

/**
 * Разбивает страницу PDF на смысловые блоки
 */
function extractPdfPageBlocks(pageNum, textContent) {
  const items = textContent.items || [];
  if (items.length === 0) return [];
  
  // Группируем элементы в строки
  const lines = groupItemsIntoLines(items);
  if (lines.length === 0) return [];
  
  // Группируем строки в блоки
  const blocks = groupLinesIntoBlocks(lines);
  
  // Преобразуем в формат PopupBlock
  return blocks.map((block, idx) => {
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text || text.length < 10) return null; // Пропускаем слишком короткие блоки
    
    // Определяем tag на основе типа
    let tag = "pdf_paragraph";
    if (block.type === "header") {
      tag = `pdf_h${Math.min(block.level, 6)}`;
    } else if (block.type === "list") {
      tag = "pdf_list";
    }
    
    return {
      block: null, // будет установлено позже
      xpath: `//pdf[@page="${pageNum}"][@block="${idx}"]`,
      tag: tag,
      text: text,
      // Дополнительные метаданные для сервера
      page: pageNum,
      blockType: block.type,
      level: block.level,
      // Метаданные структуры PDF
      fontSize: Math.round((block.fontSize || 12) * 10) / 10, // Округляем до 1 знака
      style: block.style || "normal",
      sectionNumber: block.sectionNumber || null,
      fontName: block.fontName || null
    };
  }).filter(Boolean);
}

async function extractPdfTextFromCurrentTab({ maxPages = 30 } = {}) {
  initPdfJs();

  const url = location.href; // поддерживает и file:// и https://
  const loadingTask = window.pdfjsLib.getDocument({ url });
  const pdf = await loadingTask.promise;

  const pages = Math.min(pdf.numPages, maxPages);
  const blocks = [];
  let blockIndex = 0;

  for (let pageNum = 1; pageNum <= pages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();

    // Разбиваем страницу на смысловые блоки
    const pageBlocks = extractPdfPageBlocks(pageNum, tc);
    
    for (const block of pageBlocks) {
      block.block = ++blockIndex;
      blocks.push(block);
    }
  }

  // If failed to extract structured blocks, use fallback method
  if (blocks.length === 0) {
    console.warn("[MM] Failed to extract structured blocks, using fallback method");
    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const tc = await page.getTextContent();
      const text = tc.items.map(it => (it.str || "")).join(" ").replace(/\s+/g, " ").trim();
      if (text && text.length > 40) {
        blocks.push({
          block: ++blockIndex,
          xpath: `//pdf[@page="${pageNum}"]`,
          tag: "pdf_page",
          text: text
        });
      }
    }
  } else {
    console.log(`[MM] Extracted ${blocks.length} structured blocks from PDF`);
  }

  return {
    url,
    title: document.title || url,
    text: blocks.map(b => b.text).join("\n\n"), // для обратной совместимости
    blocks: blocks // новые блоки для mindmap_markdown
  };
}

// Экспортируем в глобальный объект
window.PdfExtractor = {
  isPdfTab,
  initPdfJs,
  extractPdfTextFromCurrentTab
};

