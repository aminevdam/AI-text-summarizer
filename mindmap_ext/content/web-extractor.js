// Text extraction from web pages with improved structure and filtering

function extractTable(table) {
  const headers = Array.from(table.querySelectorAll('th'))
    .map(th => th.innerText.trim()).filter(Boolean);
  
  const rows = Array.from(table.querySelectorAll('tr'))
    .map(tr => {
      const cells = Array.from(tr.querySelectorAll('td'))
        .map(td => td.innerText.trim()).filter(Boolean);
      return cells;
    })
    .filter(row => row.length > 0);
  
  if (rows.length === 0) return null;
  
  const text = window.DOMUtils.formatTableAsText(headers, rows);
  
  return {
    type: 'table',
    headers,
    rows,
    text
  };
}

function groupBlocksByHierarchy(blocks) {
  const groups = [];
  let currentGroup = null;
  let groupId = 0;
  
  for (const block of blocks) {
    const tag = block.tag;
    
    // Если это заголовок, начинаем новую группу
    if (tag && tag.match(/^h[1-6]$/)) {
      if (currentGroup) {
        groups.push(currentGroup);
      }
      groupId++;
      currentGroup = {
        header: block,
        content: [],
        groupId: groupId
      };
      block.groupId = groupId;
    } else if (currentGroup) {
      // Добавляем в текущую группу
      currentGroup.content.push(block);
      block.groupId = groupId;
    } else {
      // Блок без заголовка - создаем отдельную группу
      groupId++;
      groups.push({
        header: null,
        content: [block],
        groupId: groupId
      });
      block.groupId = groupId;
    }
  }
  
  if (currentGroup) {
    groups.push(currentGroup);
  }
  
  return groups;
}

function collectTextBlocksQuality() {
  const root = window.DOMUtils.findMainContentRoot();

  // Дополнительная защита: выкидываем очевидный шум внутри root
  const badSelectors = [
    "nav", "header", "footer", "aside",
    "[aria-label*=cookie i]", "[class*=cookie i]", "[id*=cookie i]",
    "[class*=advert i]", "[id*=advert i]", "[class*=banner i]", "[id*=banner i]",
    "[class*=share i]", "[id*=share i]", "[class*=comment i]", "[id*=comment i]"
  ];

  badSelectors.forEach(sel => root.querySelectorAll(sel).forEach(n => n.remove()));

  // Расширенный список селекторов
  const selectors = [
    "h1", "h2", "h3", "h4", "h5", "h6",  // все уровни заголовков
    "p", "li", "blockquote", 
    "pre", "code",  // код
    "dt", "dd",  // определения
    "figcaption",  // подписи к изображениям
    "cite", "q"  // цитаты
  ];
  
  const els = Array.from(root.querySelectorAll(selectors.join(",")));

  const blocks = [];
  let blockIndex = 0;

  // Сначала обрабатываем обычные элементы
  for (const el of els) {
    // Улучшенная фильтрация
    if (!window.DOMUtils.isVisible(el)) continue;
    if (window.DOMUtils.isNoiseBlock(el)) continue;
    if (window.DOMUtils.tagIsNoise(el) || window.DOMUtils.looksLikeNoise(el)) continue;

    const text = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    // Мягче фильтры для заголовков и важных элементов
    const tag = el.tagName.toLowerCase();
    const words = text.split(/\s+/);
    
    // Для параграфов и определений - минимум 40 символов
    if ((tag === "p" || tag === "dd") && text.length < 40) continue;
    
    // Для остальных (кроме заголовков) - минимум 6 слов
    if (!tag.match(/^h[1-6]$/) && tag !== "dt" && words.length < 6) continue;
    
    // Для заголовков - минимум 2 слова
    if (tag.match(/^h[1-6]$/) && words.length < 2) continue;

    const xpath = window.DOMUtils.getXPath(el);
    if (!xpath) continue;

    // Определяем тип блока
    let blockType = "paragraph";
    if (tag.match(/^h[1-6]$/)) {
      blockType = "header";
      const level = parseInt(tag[1]) || 6;
      blocks.push({
        block: ++blockIndex,
        xpath,
        tag,
        text,
        blockType,
        level,
        parentTag: el.parentElement?.tagName.toLowerCase() || null,
        sectionLevel: window.DOMUtils.getSectionLevel(el),
        visualWeight: window.DOMUtils.getVisualWeight(el)
      });
    } else if (tag === "li") {
      blockType = "list";
      blocks.push({
        block: ++blockIndex,
        xpath,
        tag,
        text,
        blockType,
        parentTag: el.parentElement?.tagName.toLowerCase() || null,
        sectionLevel: window.DOMUtils.getSectionLevel(el),
        visualWeight: window.DOMUtils.getVisualWeight(el)
      });
    } else if (tag === "pre" || tag === "code") {
      blockType = "code";
      blocks.push({
        block: ++blockIndex,
        xpath,
        tag,
        text,
        blockType,
        parentTag: el.parentElement?.tagName.toLowerCase() || null,
        sectionLevel: window.DOMUtils.getSectionLevel(el),
        visualWeight: window.DOMUtils.getVisualWeight(el)
      });
    } else if (tag === "dt" || tag === "dd") {
      blockType = "definition";
      blocks.push({
        block: ++blockIndex,
        xpath,
        tag,
        text,
        blockType,
        parentTag: el.parentElement?.tagName.toLowerCase() || null,
        sectionLevel: window.DOMUtils.getSectionLevel(el),
        visualWeight: window.DOMUtils.getVisualWeight(el)
      });
    } else {
      blocks.push({
        block: ++blockIndex,
        xpath,
        tag,
        text,
        blockType,
        parentTag: el.parentElement?.tagName.toLowerCase() || null,
        sectionLevel: window.DOMUtils.getSectionLevel(el),
        visualWeight: window.DOMUtils.getVisualWeight(el)
      });
    }
  }

  // Обрабатываем таблицы отдельно
  const tables = Array.from(root.querySelectorAll("table"));
  for (const table of tables) {
    if (!window.DOMUtils.isVisible(table)) continue;
    if (window.DOMUtils.isNoiseBlock(table)) continue;
    if (window.DOMUtils.looksLikeNoise(table)) continue;

    const tableData = extractTable(table);
    if (!tableData || !tableData.text || tableData.text.trim().length < 40) continue;

    const xpath = window.DOMUtils.getXPath(table);
    if (!xpath) continue;

    blocks.push({
      block: ++blockIndex,
      xpath,
      tag: "table",
      text: tableData.text,
      blockType: "table",
      tableHeaders: tableData.headers,
      tableRows: tableData.rows,
      parentTag: table.parentElement?.tagName.toLowerCase() || null,
      sectionLevel: window.DOMUtils.getSectionLevel(table),
      visualWeight: window.DOMUtils.getVisualWeight(table)
    });
  }

  // Группируем блоки по иерархии
  const groups = groupBlocksByHierarchy(blocks);
  
  // Убеждаемся, что все блоки имеют groupId
  for (const group of groups) {
    if (group.header && !group.header.groupId) {
      group.header.groupId = group.groupId;
    }
    for (const block of group.content) {
      if (!block.groupId) {
        block.groupId = group.groupId;
      }
    }
  }

  return {
    url: location.href,
    title: document.title,
    root_xpath: window.DOMUtils.getXPath(root),
    blocks
  };
}

// Экспортируем в глобальный объект
window.WebExtractor = {
  collectTextBlocksQuality
};
