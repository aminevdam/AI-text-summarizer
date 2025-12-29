"""Работа с canonical text и anchors"""

import os
import re
import tempfile
import bisect
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader

from backend.models import PopupPage, PopupBlock


@dataclass
class Anchor:
    source_type: str     # text|page|pdf|docx
    source_id: str       # url|filename|pasted
    locator: Dict[str, Any]  # e.g. {"xpath": "...", "block": 12} or {"page": 3}
    start: int
    end: int


@dataclass
class Canonical:
    original_text: str
    anchors: List[Anchor]
    meta: Dict[str, Any]


def find_anchor(anchors: List[Anchor], idx: int) -> Optional[Anchor]:
    """Находит anchor, содержащий указанный индекс"""
    starts = [a.start for a in anchors]
    i = bisect.bisect_right(starts, idx) - 1
    if i < 0:
        return None
    a = anchors[i]
    return a if a.start <= idx < a.end else None


def normalize_ws(s: str) -> str:
    """Нормализует пробелы в строке"""
    return " ".join(s.split())


def canonical_from_text(text: str) -> Canonical:
    """Создает canonical из текста"""
    t = text or ""
    return Canonical(
        original_text=t,
        anchors=[Anchor(
            source_type="text",
            source_id="pasted",
            locator={"selection": True},
            start=0,
            end=len(t)
        )],
        meta={"source_type": "text"}
    )


def canonical_from_page_blocks(page: Optional[PopupPage], blocks: List[PopupBlock]) -> Canonical:
    """Создает canonical из блоков веб-страницы"""
    url = (page.url if page else None) or "current_page"
    title = (page.title if page else None) or url

    anchors: List[Anchor] = []
    parts: List[str] = []
    cursor = 0

    for b in blocks:
        txt = (b.text or "").strip()
        if not txt:
            continue
        chunk = txt if not parts else ("\n\n" + txt)
        start = cursor
        parts.append(chunk)
        cursor += len(chunk)
        end = cursor

        anchors.append(Anchor(
            source_type="page",
            source_id=url,
            locator={"xpath": b.xpath, "block": b.block, "tag": b.tag},
            start=start,
            end=end
        ))

    return Canonical(
        original_text="".join(parts),
        anchors=anchors,
        meta={"source_type": "page", "url": url, "title": title}
    )


def canonical_from_pdf_bytes(filename: str, data: bytes) -> Canonical:
    """Создает canonical из PDF файла"""
    anchors: List[Anchor] = []
    parts: List[str] = []
    cursor = 0

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as f:
        f.write(data)
        tmp_path = f.name

    try:
        docs = PyPDFLoader(tmp_path).load()  # 1 doc per page
        for d in docs:
            page = int(d.metadata.get("page", 0)) + 1
            txt = (d.page_content or "").strip()
            chunk = txt if not parts else ("\n\n" + txt)
            start = cursor
            parts.append(chunk)
            cursor += len(chunk)
            end = cursor
            anchors.append(Anchor(
                source_type="pdf",
                source_id=filename,
                locator={"page": page},
                start=start,
                end=end
            ))
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    return Canonical(
        original_text="".join(parts),
        anchors=anchors,
        meta={"source_type": "pdf", "filename": filename}
    )


def canonical_from_docx_bytes(filename: str, data: bytes) -> Canonical:
    """Создает canonical из DOCX файла"""
    anchors: List[Anchor] = []
    parts: List[str] = []
    cursor = 0

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as f:
        f.write(data)
        tmp_path = f.name

    try:
        text = Docx2txtLoader(tmp_path).load()[0].page_content or ""
        paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        for i, p in enumerate(paras, start=1):
            chunk = p if not parts else ("\n\n" + p)
            start = cursor
            parts.append(chunk)
            cursor += len(chunk)
            end = cursor
            anchors.append(Anchor(
                source_type="docx",
                source_id=filename,
                locator={"para": i},
                start=start,
                end=end
            ))
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    return Canonical(
        original_text="".join(parts),
        anchors=anchors,
        meta={"source_type": "docx", "filename": filename}
    )


def locator_to_str(source_type: str, locator: Dict[str, Any]) -> str:
    """Преобразует locator в строку"""
    if source_type == "page":
        xp = locator.get("xpath")
        b = locator.get("block")
        return f"xpath={xp}" + (f" block={b}" if b is not None else "")
    if source_type == "pdf":
        return f"page={locator.get('page')}"
    if source_type == "docx":
        return f"para={locator.get('para')}"
    if source_type == "text":
        return "selection"
    return "unknown"

