const GRADE_KANJI = {
  1: "一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六",
  2: "引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話",
  3: "悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和",
  4: "愛案以衣位茨印英栄媛塩岡億加果貨課芽賀改械害街各覚潟完官管関観願岐希季旗器機議求泣給挙漁共協鏡競極熊訓軍郡群径景芸欠結建健験固功好香候康佐差菜最埼材崎昨札刷察参産散残氏司試児治滋辞鹿失借種周祝順初松笑唱焼照城縄臣信井成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲沖兆低底的典伝徒努灯働特徳栃奈梨熱念敗梅博阪飯飛必票標不夫付府阜富副兵別辺変便包法望牧末満未民無約勇要養浴利陸良料量輪類令冷例連老労録",
};

const REVIEW_STATUSES = new Set(["draft", "approved", "needs-fix"]);
const READING_TYPES = new Set(["on", "kun"]);
const HIRAGANA = /^[ぁ-ゖ]+$/u;
const KATAKANA = /^[ァ-ヶー]+$/u;
const KUN_READING = /^[ぁ-ゖ.]+$/u;
const KANJI = /[々〇〆ヶ\u3400-\u9fff]/gu;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function allowedKanjiForGrade(grade) {
  return new Set(Object.entries(GRADE_KANJI)
    .filter(([entryGrade]) => Number(entryGrade) <= grade)
    .flatMap(([, characters]) => Array.from(characters)));
}

function visibleKanji(material) {
  return new Set([
    material.word,
    material.promptBefore,
    material.promptAfter,
    material.writingPrompt,
  ].flatMap((text) => text.match(KANJI) ?? []));
}

export function validateMaterialSource(source) {
  assert(source && source.schemaVersion === 1 && typeof source.sourceVersion === "string", "素材一覧の版が不正です");
  assert(Array.isArray(source.materials), "素材一覧がありません");
  const pairIds = new Set();
  const generationKeys = new Set();

  for (const material of source.materials) {
    const label = material?.pairId ?? "pairId不明";
    assert(material && typeof material === "object", "素材の形式が不正です");
    assert(typeof material.pairId === "string" && material.pairId.length > 0, "pairIdがありません");
    assert(!pairIds.has(material.pairId), `pairIdが重複しています: ${label}`);
    pairIds.add(material.pairId);
    assert(material.grade === 3 || material.grade === 4, `${label}: 学年が不正です`);
    assert(typeof material.primaryKanji === "string" && Array.from(material.primaryKanji).length === 1, `${label}: 主対象漢字が不正です`);
    assert(READING_TYPES.has(material.readingType), `${label}: 音訓区分が不正です`);
    assert(typeof material.canonicalReading === "string"
      && (material.readingType === "on" ? KATAKANA : KUN_READING).test(material.canonicalReading), `${label}: 基準読みが不正です`);
    assert(typeof material.word === "string" && material.word.length > 0, `${label}: 語句がありません`);
    assert(typeof material.wordReading === "string" && HIRAGANA.test(material.wordReading), `${label}: 語句の読みはひらがなにしてください`);
    assert(typeof material.promptBefore === "string" && typeof material.promptAfter === "string", `${label}: 読み問題の文脈がありません`);
    assert(typeof material.writingPrompt === "string" && material.writingPrompt.length > 0, `${label}: 書き問題文がありません`);
    assert(Array.isArray(material.targetKanji) && material.targetKanji.length > 0
      && material.targetKanji.every((character) => typeof character === "string" && Array.from(character).length === 1), `${label}: 対象漢字が不正です`);
    assert(material.targetKanji.includes(material.primaryKanji), `${label}: 主対象漢字が対象漢字に含まれていません`);
    assert(material.targetKanji.every((character) => material.word.includes(character)), `${label}: 対象漢字が語句に含まれていません`);
    assert(typeof material.sourceRef === "string" && material.sourceRef.length > 0, `${label}: 出典がありません`);
    assert(REVIEW_STATUSES.has(material.reviewStatus), `${label}: レビュー状態が不正です`);
    if (material.questionIds !== undefined) {
      assert(material.questionIds && typeof material.questionIds.reading === "string"
        && typeof material.questionIds.writing === "string"
        && material.questionIds.reading !== material.questionIds.writing, `${label}: 固定問題IDが不正です`);
    }

    const generationKey = [material.grade, material.primaryKanji, material.readingType, material.canonicalReading].join(":");
    assert(!generationKeys.has(generationKey), `生成キーが重複しています: ${generationKey}`);
    generationKeys.add(generationKey);

    const allowed = allowedKanjiForGrade(material.grade);
    const overGrade = [...visibleKanji(material)].filter((character) => !allowed.has(character));
    assert(overGrade.length === 0, `${label}: 学年配当外の漢字があります: ${overGrade.join("、")}`);
  }
  return source;
}

export function validateReadingReference(reference) {
  assert(reference && reference.schemaVersion === 1 && typeof reference.sourceVersion === "string", "音訓基準一覧の版が不正です");
  assert(reference.source && typeof reference.source.url === "string" && typeof reference.source.edition === "string", "音訓基準一覧の出典が不正です");
  for (const grade of [3, 4]) {
    const entries = reference.grades?.[String(grade)];
    assert(Array.isArray(entries), `${grade}年生の音訓基準一覧がありません`);
    const expected = Array.from(GRADE_KANJI[grade]);
    assert(entries.length === expected.length, `${grade}年生の漢字数が一致しません`);
    assert(entries.map((entry) => entry.kanji).join("") === expected.join(""), `${grade}年生の漢字順または内容が一致しません`);
    for (const entry of entries) {
      assert(Array.isArray(entry.readings) && entry.readings.length > 0, `${entry.kanji}: 音訓がありません`);
      const keys = new Set();
      for (const reading of entry.readings) {
        assert(READING_TYPES.has(reading.readingType), `${entry.kanji}: 音訓区分が不正です`);
        assert((reading.readingType === "on" ? KATAKANA : /^[ぁ-ゖ]+$/u).test(reading.canonicalReading), `${entry.kanji}: 基準読みが不正です`);
        const key = `${reading.readingType}:${reading.canonicalReading}`;
        assert(!keys.has(key), `${entry.kanji}: 音訓が重複しています: ${key}`);
        keys.add(key);
        assert(Number.isInteger(reading.sourcePage) && reading.sourcePage > 0, `${entry.kanji}: 出典ページが不正です`);
      }
    }
  }
  return reference;
}

function referenceKeys(reference) {
  return new Set([3, 4].flatMap((grade) => reference.grades[String(grade)].flatMap((entry) =>
    entry.readings.map((reading) => `${grade}:${entry.kanji}:${reading.readingType}:${reading.canonicalReading}`),
  )));
}

export function validateMaterialsAgainstReference(source, reference) {
  validateMaterialSource(source);
  validateReadingReference(reference);
  const keys = referenceKeys(reference);
  for (const material of source.materials) {
    const key = `${material.grade}:${material.primaryKanji}:${material.readingType}:${material.canonicalReading}`;
    assert(keys.has(key), `${material.pairId}: 音訓基準一覧にない生成キーです: ${key}`);
  }
  return source;
}

export function createCoverageMarkdown(source, reference) {
  validateMaterialsAgainstReference(source, reference);
  const materialMap = new Map(source.materials.map((material) => [
    `${material.grade}:${material.primaryKanji}:${material.readingType}:${material.canonicalReading}`,
    material,
  ]));
  const rows = [];
  const counts = { total: 0, created: 0, approved: 0 };
  for (const grade of [3, 4]) {
    for (const entry of reference.grades[String(grade)]) {
      for (const reading of entry.readings) {
        counts.total += 1;
        const key = `${grade}:${entry.kanji}:${reading.readingType}:${reading.canonicalReading}`;
        const material = materialMap.get(key);
        if (material) counts.created += 1;
        if (material?.reviewStatus === "approved") counts.approved += 1;
        rows.push(`| ${material?.reviewStatus ?? "missing"} | ${grade} | ${entry.kanji} | ${reading.readingType} | ${reading.canonicalReading} | ${material?.word ?? ""} | ${reading.examples} | ${reading.sourcePage} |`);
      }
    }
  }
  return `# 漢字音訓カバレッジ\n\n基準版：${reference.sourceVersion}\n素材版：${source.sourceVersion}\n\n- 基準読み：${counts.total}\n- 素材作成済み：${counts.created}\n- 確認済み：${counts.approved}\n- 未作成：${counts.total - counts.created}\n\n| 状態 | 学年 | 漢字 | 音訓 | 基準読み | 採用語句 | 文化庁の語例 | 原本ページ |\n|---|---:|---|---|---|---|---|---:|\n${rows.join("\n")}\n`;
}

function questionPair(material) {
  const common = {
    grade: material.grade,
    pairId: material.pairId,
    primaryKanji: material.primaryKanji,
    readingType: material.readingType,
    canonicalReading: material.canonicalReading,
    word: material.word,
    reading: material.wordReading,
    targetKanji: material.targetKanji,
    answerKanji: material.targetKanji.join(""),
  };
  return [{
    ...common,
    id: material.questionIds?.reading ?? `${material.pairId}:reading`,
    mode: "reading",
    prompt: `文の中の「${material.word}」の読みを答えよう`,
    promptBefore: material.promptBefore,
    promptAfter: material.promptAfter,
  }, {
    ...common,
    id: material.questionIds?.writing ?? `${material.pairId}:writing`,
    mode: "writing",
    prompt: material.writingPrompt,
  }];
}

export function generateKanjiPack(source) {
  validateMaterialSource(source);
  const approved = source.materials.filter((material) => material.reviewStatus === "approved");
  const questions = approved.flatMap(questionPair);
  assert(new Set(questions.map((question) => question.id)).size === questions.length, "生成問題IDが重複しています");
  assert(questions.length === approved.length * 2, "読み・書きペアが不足しています");
  return {
    schemaVersion: 2,
    packId: `kanji-${source.sourceVersion}`,
    sourceVersion: source.sourceVersion,
    questions,
  };
}

export function createReviewMarkdown(source) {
  validateMaterialSource(source);
  const counts = Object.fromEntries([...REVIEW_STATUSES].map((status) => [status, 0]));
  source.materials.forEach((material) => { counts[material.reviewStatus] += 1; });
  const rows = source.materials.map((material) =>
    `| ${material.reviewStatus} | ${material.grade} | ${material.primaryKanji} | ${material.readingType} | ${material.canonicalReading} | ${material.word} | ${material.wordReading} | ${material.pairId} |`,
  );
  return `# 漢字問題レビュー一覧\n\n素材版：${source.sourceVersion}\n\n- 確認済み：${counts.approved}\n- 未確認：${counts.draft}\n- 要修正：${counts["needs-fix"]}\n\n| 状態 | 学年 | 主対象 | 音訓 | 基準読み | 語句 | 語句読み | pairId |\n|---|---:|---|---|---|---|---|---|\n${rows.join("\n")}\n`;
}
