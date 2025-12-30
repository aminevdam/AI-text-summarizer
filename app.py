"""FastAPI application for mind map generation"""

import os
import base64
from typing import Dict, List

from fastapi import FastAPI
import secrets
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
import numpy as np

from backend.models import PopupPayload, MarkdownMindmapResponse
from backend.canonical import (
    canonical_from_text,
    canonical_from_page_blocks,
    canonical_from_pdf_bytes,
    canonical_from_docx_bytes
)
from backend.embeddings import (
    embed_blocks,
    embed_blocks_async,
    embed_chunks,
    chunk_text,
    build_block_catalog,
    cosine_top_k
)
from backend.clustering import choose_k, cluster_chunks, label_clusters
from backend.mindmap_builder import build_mindmap, attach_evidence
from backend.markdown_generator import (
    generate_tree_markdown,
    generate_tree_markdown_sequential,
    extract_leaves,
    select_most_important_leaves,
    generate_leaf_text,
    generate_leaves_parallel,
    ensure_block_refs,
    linkify_block_refs,
    apply_leaf_expansions,
    apply_leaf_expansions_with_remapping,
    remove_unprocessed_leaves,
    remove_empty_subsections
)
from backend.canonical import normalize_ws

load_dotenv()

# =========================
# FastAPI app
# =========================

ENV = os.getenv("ENV", "dev")

app = FastAPI(
    title="Mindmap Backend",
    docs_url=None if ENV == "prod" else "/docs",
    redoc_url=None if ENV == "prod" else "/redoc",
    openapi_url=None if ENV == "prod" else "/openapi.json",
)

API_TOKEN = os.getenv("API_TOKEN", "")

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # healthcheck — без токена
        if request.url.path == "/health":
            return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Missing bearer token")

        token = auth[7:].strip()
        if not API_TOKEN or not secrets.compare_digest(token, API_TOKEN):
            raise HTTPException(status_code=401, detail="Invalid token")

        return await call_next(request)

app.add_middleware(AuthMiddleware)

EXT_ID = os.getenv("EXT_ID", "")
if ENV=='prod':
    allow_origins = [f"chrome-extension://{EXT_ID}"]
else:
    allow_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/mindmap")
def mindmap(payload: PopupPayload):
    """Generates mind map in JSON format"""
    # 1) Canonicalize
    if payload.input_type == "text":
        canon = canonical_from_text(payload.value or "")
        title = payload.title or "pasted_text"

    elif payload.input_type == "page_blocks":
        blocks = payload.blocks or []
        canon = canonical_from_page_blocks(payload.page, blocks)
        title = payload.title or canon.meta.get("title") or canon.meta.get("url") or "page"

    elif payload.input_type == "file":
        if not payload.file:
            return {"ok": False, "error": "file field is missing"}
        raw = base64.b64decode(payload.file.content_base64)
        filename = payload.file.name

        ext = os.path.splitext(filename.lower())[1]
        if ext == ".pdf":
            canon = canonical_from_pdf_bytes(filename, raw)
        elif ext == ".docx":
            canon = canonical_from_docx_bytes(filename, raw)
        else:
            return {"ok": False, "error": "unsupported file type (need .pdf or .docx)"}

        title = payload.title or filename

    else:
        return {"ok": False, "error": "unsupported input_type"}

    if not canon.original_text.strip():
        return {"ok": False, "error": "empty text after extraction"}

    # 2) Build mindmap
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.01)
    emb = OpenAIEmbeddings(model="text-embedding-3-small")

    chunks = chunk_text(canon.original_text)
    vectors = embed_chunks(chunks, emb)
    k = choose_k(len(chunks))
    assignments = cluster_chunks(vectors, k)
    cluster_topics = label_clusters(llm, chunks, assignments, k)

    mm = build_mindmap(llm, title, cluster_topics, chunks, assignments)
    mm = attach_evidence(mm, canon)

    return {
        "ok": True,
        "mindmap": mm.model_dump(),
        "meta": {
            "source": canon.meta,
            "anchors_count": len(canon.anchors),
            "chunks_count": len(chunks),
            "clusters_k": k,
            "cluster_topics": cluster_topics,
        }
    }


@app.post("/mindmap_markdown", response_model=MarkdownMindmapResponse)
async def mindmap_markdown(payload: PopupPayload):
    """Generates mind map in Markdown format with parallel processing"""
    # Canonicalize + blocks (for page_blocks we need original blocks)
    blocks: List = []

    if payload.input_type == "page_blocks":
        blocks = payload.blocks or []
        canon = canonical_from_page_blocks(payload.page, blocks)
        title = payload.title or canon.meta.get("title") or canon.meta.get("url") or "page"
        page_url = canon.meta.get("url") or "current_page"

        # Determine if this is a PDF (by first block)
        is_pdf = False
        if blocks:
            first_block = blocks[0]
            # Check by tag (old or new format)
            if (first_block.tag == "pdf_page" or 
                first_block.tag.startswith("pdf_h") or 
                first_block.tag == "pdf_list" or
                first_block.tag == "pdf_paragraph" or
                (first_block.xpath and first_block.xpath.startswith("//pdf"))):
                is_pdf = True
            # Also check by URL
            if page_url.lower().endswith(".pdf") or ".pdf" in page_url.lower():
                is_pdf = True

        # block_id -> xpath (for both web pages and PDF)
        block_to_xpath: Dict[int, str] = {}
        for b in blocks:
            if b.block is not None and b.xpath:
                block_to_xpath[int(b.block)] = b.xpath

        # LLM + embeddings
        llm_tree = ChatOpenAI(model="gpt-4o-mini", temperature=0.02)
        llm_leaf_async = ChatOpenAI(model="gpt-4o-mini", temperature=0.02, max_tokens=200)
        emb = OpenAIEmbeddings(model="text-embedding-3-small")

        # Embeddings per block (async для ускорения)
        block_vecs, block_ids = await embed_blocks_async(blocks, emb)
        if len(block_ids) == 0:
            return MarkdownMindmapResponse(ok=False, markdown="", meta={"error": "no blocks to embed"})

        # Catalog (snippets) -> tree markdown (последовательно: темы -> подтемы)
        catalog = build_block_catalog(blocks, max_snippet_chars=220, is_pdf=is_pdf)
        # Параметр детализации: "low" (кратко), "medium" (средне), "high" (подробно)
        detail_level = "medium"  # Можно сделать настраиваемым через параметр запроса
        tree_md, topic_volumes, topic_importance = await generate_tree_markdown_sequential(
            llm_tree, title, catalog, block_vecs, block_ids, blocks, emb, 
            is_pdf=is_pdf, detail_level=detail_level
        )

        # Parse leaves
        all_leaves = extract_leaves(tree_md)
        
        # Подсчитываем количество доступных листьев
        total_leaves_count = len(all_leaves)
        print(f"[MM] Total leaves in structure: {total_leaves_count}")

        # Отбираем самые важные листья для генерации текста
        MAX_LEAVES_TO_EXPAND = 30  # Ограничиваем количество для ускорения
        important_leaves, processed_branches = select_most_important_leaves(
            all_leaves, 
            MAX_LEAVES_TO_EXPAND,
            topic_volumes,
            topic_importance
        )
        
        print(f"[MM] Selected {len(important_leaves)} most important leaves out of {total_leaves_count}")
        print(f"[MM] Processed branches: {len(processed_branches)}")

        # Параллельная обработка отобранных листьев
        expansions = await generate_leaves_parallel(
            llm_leaf_async,
            important_leaves,
            block_vecs,
            block_ids,
            blocks,
            emb,
            is_pdf,
            page_url,
            block_to_xpath,
            max_leaves=None  # Уже отобрали нужное количество
        )

        # Удаляем необработанные листья ДО применения расширений (чтобы индексы совпадали)
        processed_leaf_indices = set(expansions.keys())
        tree_md_cleaned = remove_unprocessed_leaves(tree_md, processed_leaf_indices)
        
        # Удаляем пустые подразделы (узлы без листьев)
        tree_md_cleaned = remove_empty_subsections(tree_md_cleaned)
        
        # Применяем расширения листьев к очищенному markdown
        # Нужно пересчитать индексы после удаления строк
        final_md = apply_leaf_expansions_with_remapping(tree_md_cleaned, tree_md, expansions)

        return MarkdownMindmapResponse(
            ok=True,
            markdown=final_md,
            meta={
                "source": canon.meta,
                "blocks_count": len(blocks),
                "embedded_blocks": len(block_ids),
                "leaves_total": len(all_leaves),
                "leaves_expanded": len(expansions),
                "is_pdf": is_pdf,
            }
        )

    # fallback for text/pdf/docx (currently: old /mindmap or simplified)
    return MarkdownMindmapResponse(
        ok=False,
        markdown="",
        meta={"error": "mindmap_markdown currently supports only page_blocks (web) in MVP"}
    )

