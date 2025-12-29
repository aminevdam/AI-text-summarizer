"""Построение mind map из кластеров"""

import numpy as np
from typing import Dict, List

from langchain_openai import ChatOpenAI
from langchain_core.documents import Document

from backend.models import MindMap, MindNode, Evidence
from backend.canonical import Canonical, find_anchor, normalize_ws, locator_to_str


def build_mindmap(llm: ChatOpenAI, title: str, cluster_topics: Dict[int, str],
                  chunks: List[Document], assignments: np.ndarray) -> MindMap:
    """Строит mind map из кластеров"""
    cluster_blocks = []
    for cid, topic in sorted(cluster_topics.items()):
        idxs = np.where(assignments == cid)[0][:10]
        items = []
        for i in idxs:
            ch = chunks[i]
            s = int(ch.metadata["start_index"])
            e = int(ch.metadata["end_index"])
            snippet = normalize_ws(ch.page_content)[:260]
            items.append(f"- span={s}:{e} {snippet}")
        cluster_blocks.append(f"### {cid}: {topic}\n" + "\n".join(items))

    instruction = (
        "Build a mind map (2-4 levels) from clusters.\n"
        "Rules:\n"
        "1) Nodes must be short (3-8 words).\n"
        "2) Merge duplicates.\n"
        "3) For each node, specify evidence_spans: 1-3 objects of the form {start: ..., end: ...}, only from span=...\n"
        "4) No quotes — only numbers in evidence_spans.\n"
        "5) CRITICAL LANGUAGE REQUIREMENT: Write EVERYTHING in ENGLISH ONLY. All node titles, structure, and content must be in English. Translate all content from source language to English. This is mandatory.\n"
    )

    return llm.with_structured_output(MindMap).invoke(
        f"Title: {title}\n\n{instruction}\n\nClusters:\n\n" + "\n\n".join(cluster_blocks)
    )


def quote_from_span(original_text: str, s: int, e: int, max_words: int = 40) -> str:
    """Извлекает цитату из текста по индексам"""
    raw = normalize_ws(original_text[s:e])
    words = raw.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]) + "…"
    return raw


def attach_evidence(mm: MindMap, canon: Canonical) -> MindMap:
    """Прикрепляет evidence к узлам mind map"""
    def walk(node: MindNode):
        ev: List[Evidence] = []
        for span in node.evidence_spans[:3]:
            s = int(span.start)
            e = int(span.end)
            a = find_anchor(canon.anchors, s)
            if a is None:
                ev.append(Evidence(
                    source_type=canon.meta.get("source_type", "unknown"),
                    source_id=str(canon.meta.get("url") or canon.meta.get("filename") or "unknown"),
                    locator="unknown",
                    start_index=s,
                    end_index=e,
                    quote=quote_from_span(canon.original_text, s, e)
                ))
            else:
                ev.append(Evidence(
                    source_type=a.source_type,
                    source_id=a.source_id,
                    locator=locator_to_str(a.source_type, a.locator),
                    start_index=s,
                    end_index=e,
                    quote=quote_from_span(canon.original_text, s, e)
                ))
        node.evidence = ev
        for ch in node.children:
            walk(ch)

    for n in mm.nodes:
        walk(n)
    return mm

