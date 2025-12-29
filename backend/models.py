"""Pydantic модели для API запросов и ответов"""

from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


# =========================
# Input schema (from popup)
# =========================

class PopupClient(BaseModel):
    kind: Optional[str] = None
    version: Optional[str] = None


class PopupFile(BaseModel):
    name: str
    mime: Optional[str] = None
    size_bytes: Optional[int] = None
    encoding: Literal["base64"]
    content_base64: str


class PopupPage(BaseModel):
    url: Optional[str] = None
    title: Optional[str] = None


class PopupBlock(BaseModel):
    block: Optional[int] = None
    xpath: str
    tag: Optional[str] = None
    text: str
    # Дополнительные поля для PDF блоков
    page: Optional[int] = None
    blockType: Optional[str] = None  # "header", "paragraph", "list", "table", "code", "definition"
    level: Optional[int] = None  # уровень заголовка (1-6)
    # Метаданные структуры PDF
    fontSize: Optional[float] = None  # размер шрифта
    style: Optional[str] = None  # "bold", "italic", "normal", "bold,italic"
    sectionNumber: Optional[str] = None  # нумерация раздела (например, "1.1", "2.3.1")
    fontName: Optional[str] = None  # имя шрифта
    # Дополнительные поля для веб-страниц
    parentTag: Optional[str] = None  # тег родительского элемента
    sectionLevel: Optional[int] = None  # уровень вложенности section/article
    visualWeight: Optional[float] = None  # визуальный вес (размер шрифта, жирность)
    groupId: Optional[int] = None  # ID группы связанных блоков (заголовок + контент)
    # Для таблиц
    tableHeaders: Optional[List[str]] = None  # заголовки таблицы
    tableRows: Optional[List[List[str]]] = None  # строки таблицы


class PopupPayload(BaseModel):
    schema_version: str
    created_at: str
    client: PopupClient

    input_type: Literal["text", "page_blocks", "file"]
    title: Optional[str] = None

    # text
    value: Optional[str] = None

    # page_blocks
    page: Optional[PopupPage] = None
    blocks: Optional[List[PopupBlock]] = None

    # file
    file: Optional[PopupFile] = None


# =========================
# Mind map schema (response)
# =========================

class Evidence(BaseModel):
    source_type: str
    source_id: str
    locator: str  # <-- string instead of dict
    start_index: int
    end_index: int
    quote: str


class EvidenceSpan(BaseModel):
    start: int
    end: int


class MindNode(BaseModel):
    title: str
    children: List["MindNode"] = Field(default_factory=list)
    evidence_spans: List[EvidenceSpan] = Field(default_factory=list)
    evidence: List[Evidence] = Field(default_factory=list)


MindNode.model_rebuild()


class MindMap(BaseModel):
    title: str
    nodes: List[MindNode]


class ClusterLabel(BaseModel):
    cluster_id: int
    topic: str


class ClusterLabels(BaseModel):
    labels: List[ClusterLabel]


class MarkdownMindmapResponse(BaseModel):
    ok: bool
    markdown: str
    meta: Dict[str, Any] = Field(default_factory=dict)

