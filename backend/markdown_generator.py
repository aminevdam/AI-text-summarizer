"""Генерация markdown для mind map"""

import re
import asyncio
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
from urllib.parse import quote

from langchain_openai import ChatOpenAI

from backend.prompts import (
    TREE_SYSTEM_PROMPT, 
    LEAF_SYSTEM_PROMPT, 
    get_pdf_tree_prompt, 
    WEB_TREE_SYSTEM_PROMPT,
    TOP_LEVEL_TOPICS_PROMPT,
    SUBTREE_PROMPT
)


@dataclass
class Leaf:
    line_index: int           # индекс строки в markdown
    bullet_text: str          # текст после "- "
    context_path: List[str]   # ["Раздел", "Подраздел"]


async def generate_top_level_topics(llm: ChatOpenAI, title: str, catalog: str) -> Tuple[List[str], Dict[str, int]]:
    """Генерирует список основных тем (верхний уровень) с оценкой важности
    
    Returns:
        Tuple[topics, topic_importance]: список тем и словарь тема -> важность (1-10)
    """
    user = f"Title: {title}\n\nBlocks:\n{catalog}\n"
    response = await llm.ainvoke([
        {"role": "system", "content": TOP_LEVEL_TOPICS_PROMPT},
        {"role": "user", "content": user},
    ])
    
    content = response.content.strip()
    
    # Парсим ответ: извлекаем темы и оценки важности
    topics = []
    topic_importance: Dict[str, int] = {}
    
    for line in content.splitlines():
        line = line.strip()
        # Парсим формат: ## Topic [importance:8] или ## Topic
        match = re.match(r"^##\s+(.+?)(?:\s+\[importance:(\d+)\])?$", line)
        if match:
            topic = match.group(1).strip()
            importance_str = match.group(2)
            
            if importance_str:
                importance = int(importance_str)
                # Ограничиваем диапазон 1-10
                importance = max(1, min(10, importance))
            else:
                # Если важность не указана, используем среднее значение
                importance = 5
            
            topics.append(topic)
            topic_importance[topic] = importance
    
    return topics, topic_importance


async def filter_blocks_by_topic(
    topic: str,
    block_vecs: np.ndarray,
    block_ids: List[int],
    blocks: List,
    catalog_lines: List[str],
    emb,
    top_k: int = 15
) -> str:
    """Фильтрует блоки по релевантности теме через эмбеддинги"""
    from backend.embeddings import cosine_top_k
    from backend.canonical import normalize_ws
    
    # Создаем эмбеддинг для темы (асинхронно)
    topic_vec = np.array(await emb.aembed_query(topic), dtype=np.float32)
    
    # Находим наиболее релевантные блоки
    top_indices = cosine_top_k(topic_vec, block_vecs, k=top_k)
    
    # Создаем словарь block_id -> индекс в catalog_lines
    block_id_to_catalog_line = {}
    for line in catalog_lines:
        match = re.search(r"\[b(\d+)\]", line)
        if match:
            bid = int(match.group(1))
            block_id_to_catalog_line[bid] = line
    
    # Собираем релевантные строки каталога
    relevant_lines = []
    for idx in top_indices:
        bid = block_ids[idx]
        if bid in block_id_to_catalog_line:
            relevant_lines.append(block_id_to_catalog_line[bid])
    
    return "\n".join(relevant_lines)


def calculate_topic_quota(topic_volume_percent: float, detail_level: str = "medium") -> int:
    """Вычисляет квоту подтем на основе объема темы и уровня детализации"""
    # Базовые квоты в зависимости от объема
    if topic_volume_percent >= 40:
        base_quota = 6  # Большие темы
    elif topic_volume_percent >= 20:
        base_quota = 4  # Средние темы
    elif topic_volume_percent >= 10:
        base_quota = 3  # Малые темы
    else:
        base_quota = 2  # Очень малые темы
    
    # Модификатор в зависимости от уровня детализации
    if detail_level == "low":
        multiplier = 0.6
    elif detail_level == "high":
        multiplier = 1.4
    else:  # medium
        multiplier = 1.0
    
    quota = max(1, int(base_quota * multiplier))
    return min(quota, 8)  # Максимум 8 подтем


async def calculate_topic_volume(
    topic: str,
    block_vecs: np.ndarray,
    block_ids: List[int],
    blocks: List,
    emb,
    total_length: int
) -> float:
    """Вычисляет объем темы в процентах от общего документа"""
    from backend.embeddings import cosine_top_k
    from backend.canonical import normalize_ws
    
    if total_length == 0:
        return 0.0
    
    # Создаем эмбеддинг для темы
    topic_vec = np.array(await emb.aembed_query(topic), dtype=np.float32)
    
    # Находим релевантные блоки (берем больше для точности)
    top_indices = cosine_top_k(topic_vec, block_vecs, k=min(20, len(block_ids)))
    
    # Суммируем длину релевантных блоков
    topic_length = 0
    for idx in top_indices:
        bid = block_ids[idx]
        block = next((b for b in blocks if b.block == bid), None)
        if block:
            txt = normalize_ws(block.text or "")
            topic_length += len(txt)
    
    return (topic_length / total_length) * 100 if total_length > 0 else 0.0


async def generate_subtree_for_topic(
    llm: ChatOpenAI,
    topic: str,
    filtered_catalog: str,
    topic_volume_percent: float,
    target_subtopics: int,
    detail_level: str,
    is_pdf: bool = False
) -> str:
    """Генерирует поддерево для конкретной темы с учетом квот"""
    system_prompt = SUBTREE_PROMPT.format(
        topic_title=topic,
        topic_volume_percent=topic_volume_percent,
        target_subtopics=target_subtopics,
        detail_level=detail_level
    )
    
    user = f"Blocks for topic '{topic}':\n{filtered_catalog}\n"
    
    response = await llm.ainvoke([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user},
    ])
    
    return response.content.strip()


def generate_tree_markdown(llm: ChatOpenAI, title: str, catalog: str, is_pdf: bool = False) -> str:
    """Генерирует markdown дерево из каталога блоков (старый метод - для обратной совместимости)"""
    # Используем специальный промпт для PDF, если есть структурированные блоки
    system_prompt = TREE_SYSTEM_PROMPT
    if is_pdf and ("[HEADER" in catalog or "[LIST]" in catalog):
        # Проверяем наличие метаданных структуры
        has_metadata = "§" in catalog or "font:" in catalog or "bold" in catalog
        system_prompt = get_pdf_tree_prompt(has_metadata)
    elif not is_pdf and ("[HEADER" in catalog or "[PARAGRAPH]" in catalog or "[TABLE]" in catalog):
        # Для веб-страниц используем специальный промпт с учетом структуры
        system_prompt = WEB_TREE_SYSTEM_PROMPT
    
    user = f"Title: {title}\n\nBlocks:\n{catalog}\n"
    md = llm.invoke([
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user},
    ]).content
    return md.strip()


async def generate_tree_markdown_sequential(
    llm_tree: ChatOpenAI,
    title: str,
    catalog: str,
    block_vecs: np.ndarray,
    block_ids: List[int],
    blocks: List,
    emb,
    is_pdf: bool = False,
    detail_level: str = "medium"
) -> Tuple[str, Dict[str, float], Dict[str, int]]:
    """Генерирует markdown дерево последовательно: сначала основные темы, потом подтемы для каждой
    
    Args:
        detail_level: "low", "medium", or "high" - уровень детализации
    """
    from backend.canonical import normalize_ws
    
    # Вычисляем общую длину документа для расчета пропорций
    total_length = 0
    for b in blocks:
        if b.block is not None:
            txt = normalize_ws(b.text or "")
            total_length += len(txt)
    
    # Шаг 1: Генерируем основные темы с оценкой важности
    topics, topic_importance = await generate_top_level_topics(llm_tree, title, catalog)
    
    if not topics:
        # Fallback к старому методу, если не удалось выделить темы
        tree_md = generate_tree_markdown(llm_tree, title, catalog, is_pdf)
        # Возвращаем пустые словари для fallback
        return tree_md, {}, {}
    
    # Разбиваем каталог на строки для фильтрации
    catalog_lines = catalog.splitlines()
    
    # Шаг 2: Вычисляем объемы тем и квоты на основе важности
    topic_volumes = []
    topic_quotas = []
    for topic in topics:
        volume = await calculate_topic_volume(
            topic, block_vecs, block_ids, blocks, emb, total_length
        )
        # Используем важность для корректировки квоты
        importance = topic_importance.get(topic, 5)  # По умолчанию 5
        # Комбинируем объем и важность: важность имеет больший вес
        # Важность 10 → множитель 1.5, важность 1 → множитель 0.5
        importance_multiplier = 0.5 + (importance / 10.0)  # От 0.6 до 1.5
        base_quota = calculate_topic_quota(volume, detail_level)
        # Применяем множитель важности
        adjusted_quota = max(1, int(base_quota * importance_multiplier))
        topic_volumes.append(volume)
        topic_quotas.append(min(adjusted_quota, 10))  # Максимум 10 подтем
    
    # Шаг 3: Для каждой темы генерируем поддерево
    result_lines = [f"# {title}", ""]
    
    for i, topic in enumerate(topics):
        # Добавляем основную тему
        result_lines.append(f"## {topic}")
        
        # Фильтруем блоки по теме (асинхронно)
        filtered_catalog = await filter_blocks_by_topic(
            topic, block_vecs, block_ids, blocks, catalog_lines, emb, top_k=15
        )
        
        if filtered_catalog:
            # Генерируем поддерево для темы с учетом квоты
            subtree = await generate_subtree_for_topic(
                llm_tree, 
                topic, 
                filtered_catalog, 
                topic_volumes[i],
                topic_quotas[i],
                detail_level,
                is_pdf
            )
            
            # Добавляем поддерево (уже содержит ### и -)
            if subtree:
                result_lines.append("")
                result_lines.append(subtree)
                result_lines.append("")
        else:
            # Если нет релевантных блоков, добавляем пустую строку
            result_lines.append("")
    
    # Создаем словарь объемов и важности тем для использования при отборе листьев
    topic_volumes_dict = {}
    topic_importance_dict = {}
    for i, topic in enumerate(topics):
        topic_volumes_dict[topic] = topic_volumes[i]
        topic_importance_dict[topic] = topic_importance.get(topic, 5)
    
    return "\n".join(result_lines), topic_volumes_dict, topic_importance_dict


def ensure_block_refs(text: str, chosen_ids: List[int]) -> str:
    """Оставляет только [bN] где N в chosen_ids, и если пусто — добавляет"""
    found = [int(x) for x in re.findall(r"\[b(\d+)\]", text)]
    keep = [bid for bid in found if bid in chosen_ids]

    # вырезаем все [b..]
    text_wo = re.sub(r"\[b\d+\]", "", text).strip()
    text_wo = re.sub(r"\s{2,}", " ", text_wo)

    if not keep:
        keep = chosen_ids[:2]  # минимум 1–2 ссылки

    refs = "".join([f"[b{bid}]" for bid in keep])
    return (text_wo + " " + refs).strip()


def extract_leaves(md: str) -> List[Leaf]:
    """Извлекает листья из markdown"""
    lines = md.splitlines()
    ctx: List[str] = []
    leaves: List[Leaf] = []

    for i, line in enumerate(lines):
        s = line.strip()
        if not s:
            continue

        h = re.match(r"^(#{1,6})\s+(.*)$", s)
        if h:
            level = len(h.group(1))
            title = h.group(2).strip()
            if level == 1:
                ctx = []
            elif level == 2:
                ctx = [title]
            else:
                # level>=3
                if len(ctx) >= 1:
                    ctx = [ctx[0], title]
                else:
                    ctx = [title]
            continue

        m = re.match(r"^(\-|\*)\s+(.*)$", s)
        if not m:
            m = re.match(r"^\d+\.\s+(.*)$", s)
            if m:
                bullet = m.group(1).strip()
            else:
                bullet = None
        else:
            bullet = m.group(2).strip()

        if bullet:
            leaves.append(Leaf(line_index=i, bullet_text=bullet, context_path=ctx.copy()))

    return leaves


def calculate_leaf_importance(
    leaf: Leaf,
    topic_volumes: Dict[str, float],
    topic_importance: Dict[str, int],
    total_leaves_in_branch: Dict[str, int]
) -> float:
    """Вычисляет важность листа для приоритизации
    
    Args:
        leaf: лист для оценки
        topic_volumes: словарь тема -> объем в процентах
        topic_importance: словарь тема -> важность (1-10)
        total_leaves_in_branch: словарь тема -> общее количество листьев в ветке
    
    Returns:
        Оценка важности (чем выше, тем важнее)
    """
    importance = 0.0
    
    # 1. Важность по уровню иерархии (верхние уровни важнее)
    # Листья на уровне 2 (основные темы) получают больше веса
    if len(leaf.context_path) == 1:
        importance += 100.0  # Листья в основных темах
    elif len(leaf.context_path) == 2:
        importance += 50.0   # Листья в подтемах
    else:
        importance += 25.0   # Листья в глубоких уровнях
    
    # 2. Важность по семантической важности темы (LLM оценка)
    if leaf.context_path:
        main_topic = leaf.context_path[0]
        topic_imp = topic_importance.get(main_topic, 5)  # По умолчанию 5
        # Важность темы имеет больший вес (60% от общего веса темы)
        importance += topic_imp * 15.0  # Множитель для баланса
    
    # 3. Важность по объему темы (40% от общего веса темы)
    if leaf.context_path:
        main_topic = leaf.context_path[0]
        topic_volume = topic_volumes.get(main_topic, 0.0)
        # Добавляем вес пропорционально объему темы
        importance += topic_volume * 1.0  # Меньший множитель, так как важность приоритетнее
    
    # 4. Важность по позиции (первые листья важнее)
    # Нормализуем по количеству листьев в ветке
    if leaf.context_path:
        main_topic = leaf.context_path[0]
        total_in_branch = total_leaves_in_branch.get(main_topic, 1)
        # Первые 30% листьев получают бонус
        position_ratio = 1.0 - (leaf.line_index % 100) / 100.0  # Упрощенная позиция
        if position_ratio > 0.7:  # Первые 30%
            importance += 20.0
    
    return importance


def calculate_branch_quota(
    branch: str,
    branch_volume: float,
    branch_importance: int,
    total_volume: float,
    total_importance: float,
    remaining_quota: int,
    num_branches: int,
    min_per_branch: int = 1,
    max_per_branch: int = 10
) -> int:
    """Вычисляет квоту листьев для ветки на основе объема и важности
    
    Args:
        branch: название ветки
        branch_volume: объем ветки в процентах
        branch_importance: важность ветки (1-10)
        total_volume: общий объем всех веток
        total_importance: сумма важности всех веток
        remaining_quota: оставшаяся квота для распределения
        num_branches: количество веток
        min_per_branch: минимум листьев на ветку
        max_per_branch: максимум листьев на ветку
    
    Returns:
        Квота листьев для этой ветки
    """
    # Комбинируем объем (40% веса) и важность (60% веса)
    volume_weight = 0.4
    importance_weight = 0.6
    
    if total_volume == 0 and total_importance == 0:
        # Если ничего не определено, распределяем равномерно
        return min(max_per_branch, max(min_per_branch, remaining_quota // num_branches))
    
    # Нормализуем важность (1-10 -> 0-1)
    normalized_importance = branch_importance / 10.0 if branch_importance > 0 else 0.5
    
    # Вычисляем комбинированный вес
    if total_volume > 0:
        normalized_volume = branch_volume / total_volume
    else:
        normalized_volume = 1.0 / num_branches
    
    if total_importance > 0:
        normalized_importance_ratio = branch_importance / total_importance
    else:
        normalized_importance_ratio = 1.0 / num_branches
    
    # Комбинируем: 40% объема + 60% важности
    combined_weight = (normalized_volume * volume_weight) + (normalized_importance_ratio * importance_weight)
    
    # Вычисляем пропорциональную квоту
    proportional_quota = int(combined_weight * remaining_quota)
    
    # Ограничиваем минимумом и максимумом
    quota = max(min_per_branch, min(max_per_branch, proportional_quota))
    
    return quota


def select_most_important_leaves(
    leaves: List[Leaf],
    max_leaves: int,
    topic_volumes: Dict[str, float],
    topic_importance: Dict[str, int]
) -> Tuple[List[Leaf], set]:
    """Отбирает самые важные листья для генерации текста с балансировкой между ветками
    
    Гарантирует минимум 1 лист в каждой ветке, затем распределяет оставшиеся квоты
    пропорционально объему тем с ограничением максимума на ветку.
    
    Args:
        leaves: все листья из структуры
        max_leaves: максимальное количество листьев для обработки
        topic_volumes: словарь тема -> объем в процентах
    
    Returns:
        Tuple[selected_leaves, processed_branches]: отобранные листья и множество обработанных веток
    """
    if len(leaves) <= max_leaves:
        # Если все листья помещаются, обрабатываем все ветки
        branches = set()
        for leaf in leaves:
            if leaf.context_path:
                branches.add(leaf.context_path[0])
        return leaves, branches
    
    # Группируем листья по веткам
    leaves_by_branch: Dict[str, List[Leaf]] = {}
    for leaf in leaves:
        if leaf.context_path:
            main_topic = leaf.context_path[0]
            if main_topic not in leaves_by_branch:
                leaves_by_branch[main_topic] = []
            leaves_by_branch[main_topic].append(leaf)
        else:
            # Листья без контекста идут в отдельную группу
            if "root" not in leaves_by_branch:
                leaves_by_branch["root"] = []
            leaves_by_branch["root"].append(leaf)
    
    # Подсчитываем количество листьев в каждой ветке
    total_leaves_in_branch: Dict[str, int] = {
        branch: len(branch_leaves) for branch, branch_leaves in leaves_by_branch.items()
    }
    
    # Вычисляем общий объем и важность всех веток
    total_volume = sum(topic_volumes.get(branch, 0.0) for branch in leaves_by_branch.keys())
    total_importance = sum(topic_importance.get(branch, 5) for branch in leaves_by_branch.keys())
    
    if total_volume == 0:
        # Если объемы не определены, используем равномерное распределение
        total_volume = len(leaves_by_branch) * 100.0 / len(leaves_by_branch) if leaves_by_branch else 100.0
    
    if total_importance == 0:
        total_importance = len(leaves_by_branch) * 5.0  # Средняя важность
    
    # Шаг 1: Гарантируем минимум 1 лист в каждой ветке
    selected_leaves = []
    processed_branches = set()
    branch_selected_count: Dict[str, int] = {}  # Сколько листьев уже выбрано из каждой ветки
    remaining_quota = max_leaves
    
    for branch, branch_leaves in leaves_by_branch.items():
        if remaining_quota <= 0:
            break
        
        # Вычисляем важность листьев в этой ветке
        branch_leaves_with_importance = [
            (leaf, calculate_leaf_importance(leaf, topic_volumes, topic_importance, total_leaves_in_branch))
            for leaf in branch_leaves
        ]
        branch_leaves_with_importance.sort(key=lambda x: x[1], reverse=True)
        
        # Берем самый важный лист из ветки
        if branch_leaves_with_importance:
            best_leaf = branch_leaves_with_importance[0][0]
            selected_leaves.append(best_leaf)
            processed_branches.add(branch)
            branch_selected_count[branch] = 1
            remaining_quota -= 1
    
    # Шаг 2: Распределяем оставшиеся квоты пропорционально объему с ограничением максимума
    if remaining_quota > 0:
        # Вычисляем квоты для каждой ветки на основе объема и важности
        branch_quotas: Dict[str, int] = {}
        for branch in processed_branches:
            branch_volume = topic_volumes.get(branch, 0.0)
            branch_imp = topic_importance.get(branch, 5)
            
            if branch_volume == 0:
                branch_volume = 100.0 / len(processed_branches)  # Равномерное распределение
            
            quota = calculate_branch_quota(
                branch,
                branch_volume,
                branch_imp,
                total_volume,
                total_importance,
                remaining_quota + len(processed_branches),  # Учитываем уже выделенные
                len(processed_branches),
                min_per_branch=1,  # Уже есть минимум
                max_per_branch=10   # Максимум 10 листьев на ветку
            )
            branch_quotas[branch] = quota
        
        # Заполняем квоты для каждой ветки итеративно
        # Продолжаем до тех пор, пока есть квоты и незаполненные ветки
        iteration = 0
        max_iterations = remaining_quota * 2  # Защита от бесконечного цикла
        
        while remaining_quota > 0 and iteration < max_iterations:
            iteration += 1
            added_any = False
            
            for branch, branch_leaves in leaves_by_branch.items():
                if branch not in processed_branches or remaining_quota <= 0:
                    continue
                
                current_count = branch_selected_count.get(branch, 0)
                target_quota = branch_quotas.get(branch, 1)
                
                # Если уже достигли целевой квоты или максимума, пропускаем
                if current_count >= target_quota or current_count >= 10:
                    continue
                
                # Вычисляем важность оставшихся листьев в этой ветке
                remaining_branch_leaves = [
                    leaf for leaf in branch_leaves 
                    if leaf not in selected_leaves
                ]
                
                if remaining_branch_leaves:
                    branch_leaves_with_importance = [
                        (leaf, calculate_leaf_importance(leaf, topic_volumes, topic_importance, total_leaves_in_branch))
                        for leaf in remaining_branch_leaves
                    ]
                    branch_leaves_with_importance.sort(key=lambda x: x[1], reverse=True)
                    
                    # Берем самый важный лист из этой ветки
                    best_leaf = branch_leaves_with_importance[0][0]
                    selected_leaves.append(best_leaf)
                    branch_selected_count[branch] = branch_selected_count.get(branch, 0) + 1
                    remaining_quota -= 1
                    added_any = True
            
            # Если не добавили ни одного листа, выходим
            if not added_any:
                break
    
    # Шаг 3: Если еще остались квоты, заполняем по важности (но с учетом ограничений)
    if remaining_quota > 0:
        remaining_leaves = [
            leaf for leaf in leaves 
            if leaf not in selected_leaves
        ]
        
        # Фильтруем листья: не превышаем максимум на ветку
        filtered_remaining = []
        for leaf in remaining_leaves:
            if leaf.context_path:
                branch = leaf.context_path[0]
                current_count = branch_selected_count.get(branch, 0)
                if current_count < 10:  # Максимум 10 листьев на ветку
                    filtered_remaining.append(leaf)
            else:
                filtered_remaining.append(leaf)
        
        if filtered_remaining:
            leaves_with_importance = [
                (leaf, calculate_leaf_importance(leaf, topic_volumes, topic_importance, total_leaves_in_branch))
                for leaf in filtered_remaining
            ]
            leaves_with_importance.sort(key=lambda x: x[1], reverse=True)
            
            # Берем топ-N самых важных из оставшихся
            additional_leaves = [
                leaf for leaf, _ in leaves_with_importance[:remaining_quota]
            ]
            selected_leaves.extend(additional_leaves)
    
    # Сортируем по line_index для сохранения порядка в markdown
    selected_leaves.sort(key=lambda l: l.line_index)
    
    return selected_leaves, processed_branches


def generate_leaf_text(llm: ChatOpenAI, leaf_title: str, context_path: List[str],
                       chosen_blocks: List[Tuple[int, str]]) -> str:
    """Генерирует текст для листа mind map"""
    ctx = " / ".join(context_path) if context_path else ""
    sources = "\n\n".join([f"[b{bid}] {txt}" for bid, txt in chosen_blocks])

    user = f"""Section context: {ctx}
Leaf topic: {leaf_title}

Source blocks:
{sources}
"""
    out = llm.invoke([
        {"role": "system", "content": LEAF_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ]).content.strip()

    # мягкая очистка: гарантируем, что это одна строка
    out = " ".join(out.splitlines()).strip()
    return out


async def generate_leaf_text_async(llm: ChatOpenAI, leaf_title: str, context_path: List[str],
                                    chosen_blocks: List[Tuple[int, str]]) -> str:
    """Асинхронная версия генерации текста для листа mind map"""
    ctx = " / ".join(context_path[-2:]) if context_path else ""  # Только последние 2 уровня для экономии
    sources = "\n\n".join([f"[b{bid}] {txt[:800]}" for bid, txt in chosen_blocks[:2]])  # Только 2 блока, по 800 символов

    user = f"""Section context: {ctx}
Leaf topic: {leaf_title}

Source blocks:
{sources}
"""
    response = await llm.ainvoke([
        {"role": "system", "content": LEAF_SYSTEM_PROMPT},
        {"role": "user", "content": user},
    ])
    out = response.content.strip()

    # мягкая очистка: гарантируем, что это одна строка
    out = " ".join(out.splitlines()).strip()
    return out


def linkify_block_refs(md_line: str, url: str, block_to_xpath: Dict[int, str], is_pdf: bool = False) -> str:
    """Преобразует ссылки [bN] в mm:// ссылки
    
    Для PDF страниц ссылки не создаются, только для веб-страниц.
    
    Args:
        md_line: строка markdown с ссылками [bN]
        url: URL страницы
        block_to_xpath: словарь блок -> xpath
        is_pdf: True если это PDF страница
    
    Returns:
        Строка с кликабельными ссылками (для веб) или без ссылок (для PDF)
    """
    if is_pdf:
        # Для PDF просто удаляем ссылки на блоки, оставляем только текст
        return re.sub(r"\[b\d+\]\s*", "", md_line)
    
    def repl(m):
        bid = int(m.group(1))
        xp = block_to_xpath.get(bid)
        if not xp:
            return f"[b{bid}]"
        return f"[b{bid}](mm://page?url={quote(url, safe='')}&xpath={quote(xp, safe='')}&block={bid})"
    return re.sub(r"\[b(\d+)\]", repl, md_line)


def apply_leaf_expansions(md: str, expansions: Dict[int, str]) -> str:
    """Применяет расширения листьев к markdown"""
    lines = md.splitlines()
    for idx, new_bullet_text in expansions.items():
        # заменяем строку "- old" на "- new"
        if idx < len(lines):
            lines[idx] = "- " + new_bullet_text
    return "\n".join(lines)


def apply_leaf_expansions_with_remapping(
    cleaned_md: str, 
    original_md: str, 
    expansions: Dict[int, str]
) -> str:
    """Применяет расширения листьев с пересчетом индексов после удаления строк
    
    Упрощенный подход: просто заменяем листья в cleaned_md на расширенные версии,
    используя порядок появления листьев.
    
    Args:
        cleaned_md: markdown после удаления необработанных листьев
        original_md: исходный markdown
        expansions: словарь индекс_в_исходном -> новый_текст
    
    Returns:
        Markdown с примененными расширениями
    """
    cleaned_lines = cleaned_md.splitlines()
    result_lines = []
    # Сортируем расширения по индексам для правильного порядка
    expansion_list = sorted(expansions.items(), key=lambda x: x[0])
    expansion_idx = 0
    
    for line in cleaned_lines:
        s = line.strip()
        is_leaf = bool(re.match(r"^(\-|\*)\s+", s)) or bool(re.match(r"^\d+\.\s+", s))
        
        if is_leaf and expansion_idx < len(expansion_list):
            # Заменяем лист на расширенную версию
            _, new_text = expansion_list[expansion_idx]
            result_lines.append("- " + new_text)
            expansion_idx += 1
        else:
            # Не лист - оставляем как есть
            result_lines.append(line)
    
    return "\n".join(result_lines)


def remove_unprocessed_leaves(md: str, processed_leaf_indices: set) -> str:
    """Удаляет необработанные листья из markdown
    
    Args:
        md: исходный markdown
        processed_leaf_indices: множество индексов строк обработанных листьев
    
    Returns:
        Markdown без необработанных листьев
    """
    lines = md.splitlines()
    result_lines = []
    removed_count = 0
    
    for i, line in enumerate(lines):
        s = line.strip()
        
        # Проверяем, является ли строка листом (начинается с "- " или "* ")
        is_leaf = bool(re.match(r"^(\-|\*)\s+", s)) or bool(re.match(r"^\d+\.\s+", s))
        
        if is_leaf:
            # Если лист обработан, оставляем его
            if i in processed_leaf_indices:
                result_lines.append(line)
            else:
                # Не обработан - удаляем
                removed_count += 1
        else:
            # Не лист - всегда оставляем (заголовки, пустые строки и т.д.)
            result_lines.append(line)
    
    if removed_count > 0:
        print(f"[MM] Removed {removed_count} unprocessed leaves")
    
    return "\n".join(result_lines)


def remove_empty_subsections(md: str) -> str:
    """Удаляет пустые подразделы (узлы верхнего уровня без листьев)
    
    Проходит по markdown и удаляет подразделы (###, #### и т.д.), 
    которые не содержат обработанных листьев.
    
    Args:
        md: markdown после удаления необработанных листьев
    
    Returns:
        Markdown без пустых подразделов
    """
    lines = md.splitlines()
    if not lines:
        return md
    
    result_lines = []
    i = 0
    removed_count = 0
    
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        
        # Проверяем, является ли строка заголовком подраздела (###, ####, #####, ######)
        subsection_match = re.match(r"^(#{3,6})\s+(.+)$", s)
        
        if subsection_match:
            # Найден подраздел - проверяем, есть ли после него листья
            subsection_level = len(subsection_match.group(1))
            subsection_title = subsection_match.group(2)
            
            # Ищем листья до следующего заголовка того же или более высокого уровня
            j = i + 1
            has_leaves = False
            
            while j < len(lines):
                next_line = lines[j]
                next_stripped = next_line.strip()
                
                # Если пустая строка, пропускаем
                if not next_stripped:
                    j += 1
                    continue
                
                # Проверяем, является ли это листом
                is_leaf = bool(re.match(r"^(\-|\*)\s+", next_stripped)) or bool(re.match(r"^\d+\.\s+", next_stripped))
                if is_leaf:
                    has_leaves = True
                    break
                
                # Проверяем, не встретили ли мы заголовок того же или более высокого уровня
                header_match = re.match(r"^(#{1,6})\s+", next_stripped)
                if header_match:
                    header_level = len(header_match.group(1))
                    # Если уровень заголовка <= уровня подраздела, останавливаемся
                    if header_level <= subsection_level:
                        break
                
                j += 1
            
            # Если в подразделе есть листья, оставляем его и все содержимое
            if has_leaves:
                # Добавляем заголовок подраздела
                result_lines.append(line)
                # Добавляем содержимое до следующего заголовка того же уровня
                i += 1
                while i < len(lines):
                    current_line = lines[i]
                    current_stripped = current_line.strip()
                    
                    # Проверяем, не встретили ли мы заголовок того же или более высокого уровня
                    header_match = re.match(r"^(#{1,6})\s+", current_stripped)
                    if header_match:
                        header_level = len(header_match.group(1))
                        if header_level <= subsection_level:
                            # Вернулись к заголовку того же или более высокого уровня
                            break
                    
                    result_lines.append(current_line)
                    i += 1
                continue
            else:
                # Подраздел пустой - пропускаем его и все содержимое до следующего заголовка
                removed_count += 1
                i += 1
                while i < len(lines):
                    current_line = lines[i]
                    current_stripped = current_line.strip()
                    
                    # Проверяем, не встретили ли мы заголовок того же или более высокого уровня
                    header_match = re.match(r"^(#{1,6})\s+", current_stripped)
                    if header_match:
                        header_level = len(header_match.group(1))
                        if header_level <= subsection_level:
                            # Вернулись к заголовку того же или более высокого уровня
                            break
                    
                    i += 1
                continue
        else:
            # Не подраздел - добавляем как есть
            result_lines.append(line)
            i += 1
    
    if removed_count > 0:
        print(f"[MM] Removed {removed_count} empty subsections")
    
    return "\n".join(result_lines)


async def generate_leaves_parallel(
    llm_leaf: ChatOpenAI,
    leaves: List[Leaf],
    block_vecs: np.ndarray,
    block_ids: List[int],
    blocks: List,
    emb,
    is_pdf: bool,
    page_url: str,
    block_to_xpath: Dict[int, str],
    max_leaves: Optional[int] = None
) -> Dict[int, str]:
    """Параллельно генерирует текст для всех листьев с батчингом эмбеддингов"""
    from backend.embeddings import cosine_top_k
    from backend.canonical import normalize_ws
    
    # Ограничиваем количество листьев для обработки
    if max_leaves and len(leaves) > max_leaves:
        # Приоритизируем: листья из верхних уровней иерархии
        leaves = sorted(leaves, key=lambda l: (-len(l.context_path), l.line_index))[:max_leaves]
    
    # Батчинг эмбеддингов: создаем все запросы сразу
    queries = []
    for leaf in leaves:
        query = leaf.bullet_text
        if leaf.context_path:
            query = " / ".join(leaf.context_path[-2:]) + " — " + query
        queries.append(query)
    
    # Пакетное создание эмбеддингов для всех запросов
    query_vecs = await emb.aembed_documents(queries)
    query_vecs_np = np.array(query_vecs, dtype=np.float32)
    
    # Находим топ блоки для всех запросов параллельно
    all_top_indices = []
    for qv in query_vecs_np:
        top_idx = cosine_top_k(qv, block_vecs, k=3)
        all_top_indices.append(top_idx)
    
    async def process_leaf(leaf: Leaf, query_vec: np.ndarray, top_idx: List[int]) -> Optional[Tuple[int, str]]:
        try:
            chosen = []
            for i in top_idx:
                bid = block_ids[i]
                # Find block text
                btxt = next((normalize_ws(b.text or "") for b in blocks if b.block == bid), "")
                if btxt:
                    chosen.append((bid, btxt[:1200]))
            
            if not chosen:
                return None

            # Генерация текста листа
            leaf_line = await generate_leaf_text_async(llm_leaf, leaf.bullet_text, leaf.context_path, chosen)
            chosen_ids = [bid for bid, _ in chosen]
            
            # Обработка ссылок на блоки в зависимости от типа страницы
            if is_pdf:
                # Для PDF: удаляем все ссылки на блоки [bN]
                leaf_line = linkify_block_refs(leaf_line, page_url, block_to_xpath, is_pdf=True)
            else:
                # Для веб-страниц: добавляем ссылки на блоки и делаем их кликабельными
                leaf_line = ensure_block_refs(leaf_line, chosen_ids)
                leaf_line = linkify_block_refs(leaf_line, page_url, block_to_xpath, is_pdf=False)
            
            return leaf.line_index, leaf_line
        except Exception as e:
            print(f"Error processing leaf {leaf.line_index}: {e}")
            return None
    
    # Параллельная обработка всех листьев (эмбеддинги уже готовы)
    tasks = [
        process_leaf(leaf, query_vecs_np[i], all_top_indices[i])
        for i, leaf in enumerate(leaves)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    expansions = {}
    for result in results:
        if result and not isinstance(result, Exception):
            if result is not None:
                idx, text = result
                if idx is not None:
                    expansions[idx] = text
    
    return expansions

