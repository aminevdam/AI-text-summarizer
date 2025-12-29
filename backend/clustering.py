"""Кластеризация текстовых чанков"""

import math
import numpy as np
from typing import Dict, List

from sklearn.cluster import KMeans
from langchain_openai import ChatOpenAI
from langchain_core.documents import Document

from backend.models import ClusterLabels
from backend.canonical import normalize_ws


def choose_k(n: int) -> int:
    """Выбирает оптимальное количество кластеров"""
    # n = количество объектов (chunks)
    if n <= 1:
        return 1
    return max(2, min(12, int(math.sqrt(n))))


def cluster_chunks(vectors: np.ndarray, k: int) -> np.ndarray:
    """Кластеризует векторы с помощью KMeans"""
    n = int(vectors.shape[0])
    if n <= 1:
        return np.zeros(n, dtype=int)  # все в один кластер

    k = max(1, min(int(k), n))         # k не больше числа сэмплов
    if k == 1:
        return np.zeros(n, dtype=int)

    km = KMeans(n_clusters=k, n_init="auto", random_state=42)
    return km.fit_predict(vectors)


def label_clusters(llm: ChatOpenAI, chunks: List[Document], assignments: np.ndarray, k: int) -> Dict[int, str]:
    """Генерирует метки для кластеров с помощью LLM"""
    reps = []
    for cid in range(k):
        idxs = np.where(assignments == cid)[0][:3]
        sample = "\n\n".join(
            f"[{chunks[i].metadata['chunk_id']}] {normalize_ws(chunks[i].page_content)[:450]}"
            for i in idxs
        )
        reps.append(f"CLUSTER {cid} SAMPLES:\n{sample}")

    prompt = (
        "Give a short topic (2-6 words) for each cluster in ENGLISH ONLY. "
        "CRITICAL: Write ONLY in English, regardless of the source text language. "
        "Translate all topics to English. This is mandatory.\n\n"
        + "\n\n".join(reps)
    )

    res: ClusterLabels = llm.with_structured_output(ClusterLabels).invoke(prompt)
    return {x.cluster_id: x.topic for x in res.labels}

