"""Add safe word candidates to the canonical material file as unreviewed drafts.

Existing material keys are never replaced. Ambiguous readings, grade rewrites,
iteration marks, and repeated target characters remain outside the material file.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def generation_key(item: dict) -> str:
    return f"{item['grade']}:{item['primaryKanji']}:{item['readingType']}:{item['canonicalReading']}"


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("CANDIDATES.json MATERIALS.json SOURCE_VERSION are required")
    candidate_path = Path(sys.argv[1])
    material_path = Path(sys.argv[2])
    source_version = sys.argv[3]
    candidate_data = json.loads(candidate_path.read_text(encoding="utf-8"))
    material_data = json.loads(material_path.read_text(encoding="utf-8"))
    existing = {generation_key(material) for material in material_data["materials"]}
    added = 0
    skipped = {"existing": 0, "not-ready": 0, "ambiguous-reading": 0, "unsupported-word": 0}

    for candidate in candidate_data["candidates"]:
        key = generation_key(candidate)
        if key in existing:
            skipped["existing"] += 1
            continue
        if candidate["status"] != "candidate" or not candidate["selected"]:
            skipped["not-ready"] += 1
            continue
        selected = candidate["selected"]
        if selected["readingCheck"] == "manual-review":
            skipped["ambiguous-reading"] += 1
            continue
        target_kanji = selected["targetKanji"]
        if any(mark in selected["word"] for mark in "々〇〆ヶ") or len(target_kanji) != len(set(target_kanji)):
            skipped["unsupported-word"] += 1
            continue
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
        material_data["materials"].append({
            "pairId": f"kanji-g{candidate['grade']}-{candidate['primaryKanji']}-{candidate['readingType']}-{digest}",
            "grade": candidate["grade"],
            "primaryKanji": candidate["primaryKanji"],
            "readingType": candidate["readingType"],
            "canonicalReading": candidate["canonicalReading"],
            "word": selected["word"],
            "wordReading": selected["wordReading"],
            "promptBefore": "教科書に「",
            "promptAfter": "」と書いてあります。",
            "targetKanji": target_kanji,
            "writingPrompt": f"「{selected['wordReading']}」の漢字の部分を書こう",
            "sourceRef": f"文化庁『常用漢字（音訓）基本データ』{candidate['sourcePage']}ページ",
            "reviewStatus": "draft",
            "candidateMeta": {
                "origin": "official-example-with-janome-reading",
                "readingCheck": selected["readingCheck"],
            },
        })
        existing.add(key)
        added += 1

    material_data["sourceVersion"] = source_version
    material_path.write_text(json.dumps(material_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"added": added, "totalMaterials": len(material_data["materials"]), "skipped": skipped}, ensure_ascii=False))


if __name__ == "__main__":
    main()
