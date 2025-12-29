// Utilities for DOM manipulation

function isVisible(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  return true;
}

function isNoiseBlock(el) {
  if (!isVisible(el)) return true;
  
  // Проверка размера (слишком маленькие элементы)
  const rect = el.getBoundingClientRect();
  if (rect.width < 50 && rect.height < 50) return true;
  
  // Проверка соотношения текста и ссылок
  const linkRatio = linkTextLen(el) / Math.max(1, textLen(el));
  if (linkRatio > 0.4) return true;  // слишком много ссылок
  
  // Проверка на скрытые элементы (даже если display != none)
  const style = window.getComputedStyle(el);
  if (style.position === 'fixed' && rect.top < 0 && rect.height < 100) {
    // Возможно, это скрытое меню
    return true;
  }
  
  return false;
}

function getLinkTextRatio(el) {
  const totalText = textLen(el);
  if (totalText === 0) return 0;
  return linkTextLen(el) / totalText;
}

function getSectionLevel(el) {
  let level = 0;
  let current = el;
  while (current && current !== document.body) {
    const tag = current.tagName?.toLowerCase();
    if (tag === 'section' || tag === 'article') {
      level++;
    }
    current = current.parentElement;
  }
  return level;
}

function getVisualWeight(el) {
  const style = window.getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize) || 16;
  const fontWeight = style.fontWeight;
  const isBold = fontWeight === 'bold' || fontWeight === '700' || 
                 parseInt(fontWeight) >= 600;
  
  // Базовый вес = размер шрифта
  let weight = fontSize;
  
  // Бонус за жирность
  if (isBold) weight *= 1.3;
  
  // Бонус за заголовки
  const tag = el.tagName?.toLowerCase();
  if (tag && tag.match(/^h[1-6]$/)) {
    const level = parseInt(tag[1]) || 6;
    weight *= (7 - level) * 0.2 + 1;  // h1 = 1.2x, h2 = 1.0x, h3 = 0.8x, etc.
  }
  
  return weight;
}

function formatTableAsText(headers, rows) {
  if (!headers || headers.length === 0) {
    // Если нет заголовков, просто объединяем все ячейки
    return rows.map(row => row.join(' | ')).join('\n');
  }
  
  // Форматируем таблицу с заголовками
  let text = headers.join(' | ') + '\n';
  text += rows.map(row => {
    // Выравниваем количество колонок
    const paddedRow = [...row];
    while (paddedRow.length < headers.length) {
      paddedRow.push('');
    }
    return paddedRow.slice(0, headers.length).join(' | ');
  }).join('\n');
  
  return text;
}

function looksLikeNoise(el) {
  const s = ((el.id || "") + " " + (el.className || "")).toLowerCase();
  return /nav|menu|header|footer|aside|sidebar|breadcrumb|share|social|comment|subscribe|promo|banner|cookie|modal|popup|paywall|advert|ads|outbrain|recommend|related|newsletter|widget/.test(s);
}

function tagIsNoise(el) {
  const t = el.tagName?.toLowerCase();
  return ["nav", "header", "footer", "aside", "script", "style", "noscript"].includes(t);
}

function textLen(el) {
  return (el.innerText || "").replace(/\s+/g, " ").trim().length;
}

function linkTextLen(el) {
  let len = 0;
  el.querySelectorAll("a").forEach(a => { len += ((a.innerText || "").trim().length); });
  return len;
}

function punctuationScore(el) {
  const t = (el.innerText || "");
  // чем больше "." ":" ";" — тем вероятнее связный текст
  const m = t.match(/[\.:\;\!\?]/g);
  return m ? m.length : 0;
}

function getXPath(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
  if (el.id) return `//*[@id="${el.id}"]`;

  const parts = [];
  while (el && el.nodeType === Node.ELEMENT_NODE) {
    let idx = 1;
    let sib = el.previousSibling;
    while (sib) {
      if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === el.tagName) idx++;
      sib = sib.previousSibling;
    }
    parts.unshift(`${el.tagName.toLowerCase()}[${idx}]`);
    el = el.parentNode;
  }
  return "/" + parts.join("/");
}

function findMainContentRoot() {
  // явные кандидаты
  const preferred = document.querySelector("article") || document.querySelector("main");
  if (preferred && isVisible(preferred) && !looksLikeNoise(preferred)) return preferred;

  // сканируем кандидатов
  const candidates = Array.from(document.querySelectorAll("article, main, section, div"));
  let best = { el: document.body, score: -Infinity };

  for (const el of candidates) {
    if (!isVisible(el)) continue;
    if (tagIsNoise(el) || looksLikeNoise(el)) continue;

    const tLen = textLen(el);
    if (tLen < 800) continue; // слишком мало текста — почти всегда не статья

    const lLen = linkTextLen(el);
    const linkRatio = lLen / Math.max(1, tLen);

    // штраф за слишком много ссылок (меню/агрегаторы)
    if (linkRatio > 0.35) continue;

    // бонус за заголовки/параграфы
    const pCount = el.querySelectorAll("p").length;
    const liCount = el.querySelectorAll("li").length;
    const hCount = el.querySelectorAll("h1,h2,h3").length;

    // итоговый скор
    // текст + пунктуация + структура - "ссылочность" - шум
    let score =
      tLen * 1.0 +
      punctuationScore(el) * 25 +
      pCount * 80 +
      liCount * 25 +
      hCount * 60 -
      linkRatio * 1200;

    // лёгкий бонус если внутри есть <time> или <figure>
    if (el.querySelector("time")) score += 120;
    if (el.querySelector("figure")) score += 80;

    // штраф если класс/ид похож на "comments/related"
    if (looksLikeNoise(el)) score -= 800;

    if (score > best.score) best = { el, score };
  }

  return best.el || document.body;
}

// Экспортируем в глобальный объект
window.DOMUtils = {
  isVisible,
  looksLikeNoise,
  tagIsNoise,
  textLen,
  linkTextLen,
  punctuationScore,
  getXPath,
  findMainContentRoot,
  isNoiseBlock,
  getLinkTextRatio,
  getSectionLevel,
  getVisualWeight,
  formatTableAsText
};

