"""Extract grade 3/4 on/kun readings from the official Agency for Cultural Affairs PDF.

Usage:
  python scripts/extract-joyo-readings.py INPUT.pdf OUTPUT.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

GRADE_KANJI = {
    "3": "悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和",
    "4": "愛案以衣位茨印英栄媛塩岡億加果貨課芽賀改械害街各覚潟完官管関観願岐希季旗器機議求泣給挙漁共協鏡競極熊訓軍郡群径景芸欠結建健験固功好香候康佐差菜最埼材崎昨札刷察参産散残氏司試児治滋辞鹿失借種周祝順初松笑唱焼照城縄臣信井成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲沖兆低底的典伝徒努灯働特徳栃奈梨熱念敗梅博阪飯飛必票標不夫付府阜富副兵別辺変便包法望牧末満未民無約勇要養浴利陸良料量輪類令冷例連老労録",
}

KANJI_RE = re.compile(r"[\u3400-\u9fff]")


def clean(value: str | None) -> str:
    return re.sub(r"\s+", "", value or "")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("INPUT.pdf and OUTPUT.json are required")
    input_path, output_path = map(Path, sys.argv[1:])
    wanted = {character for characters in GRADE_KANJI.values() for character in characters}
    found: dict[str, list[dict[str, object]]] = {character: [] for character in wanted}

    with pdfplumber.open(input_path) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            for table in page.extract_tables():
                for row in table:
                    if len(row) < 7:
                        continue
                    if not clean(row[0]).isdigit():
                        continue
                    match = KANJI_RE.search(clean(row[1]))
                    if not match or match.group() not in wanted:
                        continue
                    reading_label = clean(row[4])
                    if "音" in reading_label:
                        reading_type = "on"
                    elif "訓" in reading_label:
                        reading_type = "kun"
                    else:
                        continue
                    canonical = clean(row[5]).replace("▽", "").replace("*", "")
                    if not canonical:
                        continue
                    entry = {
                        "readingType": reading_type,
                        "canonicalReading": canonical,
                        "examples": clean(row[6]),
                        "sourcePage": page_number,
                    }
                    if entry not in found[match.group()]:
                        found[match.group()].append(entry)

    missing = sorted(character for character, readings in found.items() if not readings)
    if missing:
        raise ValueError(f"readings not found for: {''.join(missing)}")

    output = {
        "schemaVersion": 1,
        "sourceVersion": "joyo-2010-agency-cultural-affairs",
        "source": {
            "title": "常用漢字（音訓）基本データ",
            "edition": "平成22年11月30日内閣告示対応",
            "url": "https://www.bunka.go.jp/seisaku/bunkashingikai/kokugo/shoiinkai/iinkai_02/pdf/sanko_2.pdf",
        },
        "grades": {
            grade: [
                {"kanji": character, "readings": found[character]}
                for character in characters
            ]
            for grade, characters in GRADE_KANJI.items()
        },
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts = {grade: sum(len(entry["readings"]) for entry in entries) for grade, entries in output["grades"].items()}
    print(f"extracted kanji: grade3={len(output['grades']['3'])}, grade4={len(output['grades']['4'])}")
    print(f"extracted readings: grade3={counts['3']}, grade4={counts['4']}")


if __name__ == "__main__":
    main()
