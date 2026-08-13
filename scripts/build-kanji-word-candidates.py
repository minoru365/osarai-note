"""Select grade-compatible words from official examples and attach draft readings.

The output is a review queue, not publishable question material. Janome readings
are candidates and must be checked by a person against the official example row.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from janome.tokenizer import Tokenizer

GRADE_1 = "一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六"
GRADE_2 = "引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話"
KANJI_RE = re.compile(r"[\u3400-\u9fff]")
WORD_RE = re.compile(r"^[々〇〆ヶ\u3400-\u9fffぁ-ゖァ-ヶー]+$")


def katakana_to_hiragana(value: str) -> str:
    return "".join(chr(ord(char) - 0x60) if "ァ" <= char <= "ヶ" else char for char in value)


def clean_example(value: str) -> str:
    value = re.sub(r"[（(].*?[）)]", "", value)
    value = re.sub(r"[｛{].*?[｝}]", "", value)
    value = re.sub(r"[〔［].*?[〕］]", "", value)
    return value.strip("…「」『』\"' ")


def split_examples(value: str) -> list[str]:
    result = []
    for part in re.split(r"[，、,･・]", value):
        candidate = clean_example(part)
        if candidate and WORD_RE.fullmatch(candidate) and candidate not in result:
            result.append(candidate)
    return result


def dictionary_reading(tokenizer: Tokenizer, word: str) -> str | None:
    pieces = []
    for token in tokenizer.tokenize(word):
        reading = token.reading
        if not reading or reading == "*":
            if re.fullmatch(r"[ぁ-ゖー]+", token.surface):
                pieces.append(token.surface)
                continue
            return None
        pieces.append(katakana_to_hiragana(reading))
    reading = "".join(pieces)
    return reading if re.fullmatch(r"[ぁ-ゖー]+", reading) else None


def reading_for(tokenizer: Tokenizer, word: str, primary: str, reading_type: str, canonical: str) -> tuple[str | None, str]:
    # For a single target kanji followed only by okurigana, the official row is
    # more specific than a context-free morphological dictionary.
    if reading_type == "kun" and re.fullmatch(re.escape(primary) + r"[ぁ-ゖー]*", word):
        return canonical, "official-kun-reading"
    reading = dictionary_reading(tokenizer, word)
    if not reading:
        return None, "unresolved"
    canonical_hiragana = katakana_to_hiragana(canonical)
    variants = {canonical_hiragana}
    if canonical_hiragana.endswith(("つ", "く", "ち")):
        variants.add(canonical_hiragana[:-1] + "っ")
    direct = any(variant in reading for variant in variants)
    return reading, "canonical-visible" if direct else "manual-review"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("REFERENCE.json and OUTPUT.json are required")
    reference_path, output_path = map(Path, sys.argv[1:])
    reference = json.loads(reference_path.read_text(encoding="utf-8"))
    grade_chars = {
        3: set(GRADE_1 + GRADE_2 + "".join(entry["kanji"] for entry in reference["grades"]["3"])),
        4: set(GRADE_1 + GRADE_2 + "".join(entry["kanji"] for grade in ("3", "4") for entry in reference["grades"][grade])),
    }
    tokenizer = Tokenizer()
    candidates = []
    status_counts: dict[str, int] = {}

    for grade in (3, 4):
        for kanji_entry in reference["grades"][str(grade)]:
            for reading in kanji_entry["readings"]:
                alternatives = []
                for word in split_examples(reading["examples"]):
                    word_kanji = KANJI_RE.findall(word)
                    over_grade = sorted({character for character in word_kanji if character not in grade_chars[grade]})
                    word_reading, reading_check = reading_for(
                        tokenizer,
                        word,
                        kanji_entry["kanji"],
                        reading["readingType"],
                        reading["canonicalReading"],
                    )
                    alternatives.append({
                        "word": word,
                        "wordReading": word_reading,
                        "readingCheck": reading_check,
                        "targetKanji": list(dict.fromkeys(word_kanji)),
                        "overGradeKanji": over_grade,
                    })
                grade_compatible = [item for item in alternatives if not item["overGradeKanji"]]
                selected = next((item for item in grade_compatible if item["wordReading"] and item["readingCheck"] != "manual-review"), None)
                selected = selected or next((item for item in grade_compatible if item["wordReading"]), None)
                if selected:
                    status = "candidate"
                elif grade_compatible:
                    status = "reading-unresolved"
                elif alternatives:
                    status = "needs-rewrite"
                else:
                    status = "no-example"
                status_counts[status] = status_counts.get(status, 0) + 1
                if selected and selected["readingCheck"] == "manual-review":
                    status_counts["reading-manual-review"] = status_counts.get("reading-manual-review", 0) + 1
                candidates.append({
                    "grade": grade,
                    "primaryKanji": kanji_entry["kanji"],
                    "readingType": reading["readingType"],
                    "canonicalReading": reading["canonicalReading"],
                    "sourcePage": reading["sourcePage"],
                    "status": status,
                    "selected": selected,
                    "officialExamples": alternatives,
                })

    output = {
        "schemaVersion": 1,
        "candidateVersion": reference["sourceVersion"],
        "readingEngine": {"name": "Janome", "version": "0.5.0", "status": "unreviewed-candidate-only"},
        "counts": {"total": len(candidates), **status_counts},
        "candidates": candidates,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
