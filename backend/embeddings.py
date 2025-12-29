"""Эмбеддинги и работа с блоками"""

import numpy as np
from typing import List, Tuple

from langchain_openai import OpenAIEmbeddings
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.models import PopupBlock
from backend.canonical import normalize_ws


def cosine_top_k(query_vec: np.ndarray, mat: np.ndarray, k: int) -> List[int]:
    """Находит top-k наиболее похожих векторов по cosine similarity"""
    # query_vec: (d,), mat: (n,d)
    # cosine similarity assuming embeddings already roughly normalized, но нормализуем на всякий
    q = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    M = mat / (np.linalg.norm(mat, axis=1, keepdims=True) + 1e-9)
    sims = M @ q
    k = max(1, min(k, len(sims)))
    top = np.argpartition(-sims, k-1)[:k]
    top = top[np.argsort(-sims[top])]
    return top.tolist()


def build_block_catalog(blocks: List[PopupBlock], max_snippet_chars: int = 240, is_pdf: bool = False) -> str:
    """Строит каталог блоков для передачи в LLM с учетом пропорций объемов"""
    lines = []
    current_group = None
    
    # Вычисляем длину каждого блока и общую длину
    block_lengths = {}
    total_length = 0
    for b in blocks:
        if b.block is None:
            continue
        txt = normalize_ws(b.text or "")
        if not txt:
            continue
        length = len(txt)
        block_lengths[b.block] = length
        total_length += length
    
    # Группируем блоки по группам и вычисляем пропорции
    group_lengths = {}
    for b in blocks:
        if b.block is None:
            continue
        txt = normalize_ws(b.text or "")
        if not txt:
            continue
        group_id = b.groupId if b.groupId is not None else 0
        if group_id not in group_lengths:
            group_lengths[group_id] = 0
        group_lengths[group_id] += block_lengths.get(b.block, 0)
    
    # Вычисляем пропорции для каждой группы (в процентах)
    group_proportions = {}
    if total_length > 0:
        for group_id, length in group_lengths.items():
            proportion = (length / total_length) * 100
            group_proportions[group_id] = proportion
    
    # Добавляем информацию о пропорциях в начало каталога
    if group_proportions and len(group_proportions) > 1:
        proportion_info = []
        sorted_groups = sorted(group_proportions.items(), key=lambda x: x[1], reverse=True)
        for group_id, prop in sorted_groups[:5]:  # Топ-5 групп по объему
            proportion_info.append(f"Group {group_id}: {prop:.1f}%")
        if proportion_info:
            lines.append(f"DOCUMENT STRUCTURE PROPORTIONS: {' | '.join(proportion_info)}")
            lines.append("IMPORTANT: The number of leaves and detail level for each section should reflect these proportions.")
            lines.append("")
    
    for b in blocks:
        bid = b.block
        if bid is None:
            continue
        txt = normalize_ws(b.text or "")
        if not txt:
            continue
        
        # Для PDF используем структурированный формат с метаданными
        if is_pdf:
            tag = b.tag or 'pdf_paragraph'
            block_type = b.blockType
            level = b.level or 0
            section_number = b.sectionNumber
            style = b.style
            font_size = b.fontSize
            
            # Определяем префикс на основе типа блока
            prefix = ""
            if tag and tag.startswith("pdf_h"):
                header_level = tag.replace("pdf_h", "")
                prefix = f"[HEADER L{header_level}]"
            elif tag == "pdf_list":
                prefix = "[LIST]"
            elif block_type == "header":
                prefix = f"[HEADER L{level}]" if level > 0 else "[HEADER]"
            elif block_type == "list":
                prefix = "[LIST]"
            else:
                prefix = "[PARAGRAPH]"
            
            # Добавляем метаданные к префиксу
            meta_parts = []
            if section_number:
                meta_parts.append(f"§{section_number}")
            if style and style != "normal":
                meta_parts.append(style)
            if font_size:
                meta_parts.append(f"font:{font_size:.1f}")
            
            if meta_parts:
                prefix += " " + " ".join(meta_parts)
            prefix += " "
            
            snippet = txt[:max_snippet_chars]
            # Добавляем информацию о длине блока (в символах) для контекста
            block_len = block_lengths.get(bid, 0)
            if block_len > 0 and total_length > 0:
                block_prop = (block_len / total_length) * 100
                # Добавляем информацию о пропорции только для больших блоков (>1% текста)
                if block_prop > 1.0:
                    prefix += f" size:{block_prop:.1f}%"
            lines.append(f"[b{bid}] {prefix}{snippet}")
        else:
            # Для веб-страниц используем метаданные структуры
            block_type = b.blockType or "paragraph"
            level = b.level
            parent_tag = b.parentTag
            section_level = b.sectionLevel
            visual_weight = b.visualWeight
            group_id = b.groupId
            
            # Группируем блоки по группам
            if group_id is not None and group_id != current_group:
                if current_group is not None:
                    lines.append("")  # разделитель между группами
                current_group = group_id
                # Если это заголовок группы, добавляем его отдельно
                if block_type == "header" and level:
                    header_text = txt[:max_snippet_chars]
                    prefix = f"[HEADER L{level}]"
                    if section_level:
                        prefix += f" section:{section_level}"
                    if visual_weight:
                        prefix += f" weight:{visual_weight:.1f}"
                    lines.append(f"[b{bid}] {prefix} {header_text}")
                    continue
            
            # Определяем префикс на основе типа блока
            prefix = ""
            if block_type == "header" and level:
                prefix = f"[HEADER L{level}]"
            elif block_type == "list":
                prefix = "[LIST]"
            elif block_type == "table":
                prefix = "[TABLE]"
                # Для таблиц добавляем информацию о структуре
                if b.tableHeaders:
                    prefix += f" cols:{len(b.tableHeaders)}"
            elif block_type == "code":
                prefix = "[CODE]"
            elif block_type == "definition":
                prefix = "[DEFINITION]"
            else:
                prefix = "[PARAGRAPH]"
            
            # Добавляем метаданные
            meta_parts = []
            if parent_tag and parent_tag not in ["body", "html", "div"]:
                meta_parts.append(f"parent:{parent_tag}")
            if section_level:
                meta_parts.append(f"section:{section_level}")
            if visual_weight and visual_weight > 16:  # только если заметно больше базового
                meta_parts.append(f"weight:{visual_weight:.1f}")
            
            if meta_parts:
                prefix += " " + " ".join(meta_parts)
            prefix += " "
            
            snippet = txt[:max_snippet_chars]
            # Добавляем информацию о длине блока и пропорции группы
            block_len = block_lengths.get(bid, 0)
            group_id = b.groupId if b.groupId is not None else 0
            group_prop = group_proportions.get(group_id, 0)
            
            # Добавляем информацию о пропорции группы для больших групп (>5% текста)
            if group_prop > 5.0:
                prefix += f" group_size:{group_prop:.1f}%"
            # Добавляем информацию о длине блока для больших блоков (>1% текста)
            if block_len > 0 and total_length > 0:
                block_prop = (block_len / total_length) * 100
                if block_prop > 1.0:
                    prefix += f" size:{block_prop:.1f}%"
            lines.append(f"[b{bid}] {prefix}{snippet}")
    
    return "\n".join(lines)


def embed_blocks(blocks: List[PopupBlock], emb: OpenAIEmbeddings) -> Tuple[np.ndarray, List[int]]:
    """Создает эмбеддинги для блоков"""
    texts = []
    ids = []
    for b in blocks:
        if b.block is None:
            continue
        t = normalize_ws(b.text or "")
        if not t:
            continue
        ids.append(int(b.block))
        texts.append(t[:4000])
    vecs = emb.embed_documents(texts)
    return np.array(vecs, dtype=np.float32), ids


async def embed_blocks_async(blocks: List[PopupBlock], emb: OpenAIEmbeddings) -> Tuple[np.ndarray, List[int]]:
    """Асинхронная версия создания эмбеддингов для блоков"""
    texts = []
    ids = []
    for b in blocks:
        if b.block is None:
            continue
        t = normalize_ws(b.text or "")
        if not t:
            continue
        ids.append(int(b.block))
        texts.append(t[:4000])
    vecs = await emb.aembed_documents(texts)
    return np.array(vecs, dtype=np.float32), ids


def chunk_text(original_text: str) -> List[Document]:
    """Разбивает текст на чанки"""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=3000,
        chunk_overlap=500,
        add_start_index=True,
        separators=["\n\n", "\n", " ", ""],
    )
    doc = Document(page_content=original_text)
    chunks = splitter.split_documents([doc])

    out: List[Document] = []
    for i, ch in enumerate(chunks):
        start = int(ch.metadata["start_index"])
        end = start + len(ch.page_content)
        out.append(Document(
            page_content=ch.page_content,
            metadata={"chunk_id": f"c{i}", "start_index": start, "end_index": end}
        ))
    return out


def embed_chunks(chunks: List[Document], emb: OpenAIEmbeddings) -> np.ndarray:
    """Создает эмбеддинги для чанков"""
    texts = [normalize_ws(c.page_content)[:4000] for c in chunks]
    vecs = emb.embed_documents(texts)
    return np.array(vecs, dtype=np.float32)

