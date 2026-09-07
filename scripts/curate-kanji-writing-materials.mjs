// 4年生の書き問題について、ひらがなから答えの漢字を想起しやすい
// 文脈へ整える。自然な学年内の代替語がない語句は needs-fix として残す。
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(projectRoot, "content-source/kanji-materials.json");
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const updates = new Map([
  ["kanji-g4-群-kun-da56f4e60188", {
    word: "群がる", wordReading: "むらがる", targetKanji: ["群"],
    promptBefore: "魚がえさに", promptAfter: "様子を見ました。",
  }],
  ["kanji-g4-臣-on-bbf7f895c4fb", { promptBefore: "昔の王様に仕える", promptAfter: "について学びました。" }],
  ["kanji-g4-井-on-f05056ae4948", { promptBefore: "地中から石油をくみ出す", promptAfter: "について調べました。" }],
  ["kanji-g4-成-kun-9d4660ca1747", {
    word: "成り立つ", wordReading: "なりたつ", targetKanji: ["成", "立"],
    promptBefore: "このルールが", promptAfter: "理由を考えました。",
  }],
  ["kanji-g4-省-on-2a7f9d9b77a6", { promptBefore: "国の仕事を受け持つ", promptAfter: "が、それぞれの仕事をしています。" }],
  ["kanji-g4-省-kun-f1b1a4145919", {
    word: "省みて", wordReading: "かえりみて", targetKanji: ["省"],
    promptBefore: "失敗した自分の行動を", promptAfter: "、次に生かします。",
  }],
  ["kanji-g4-清-kun-8e8edff93246", { promptBefore: "", promptAfter: "心を大切にしたいと思います。" }],
  ["kanji-g4-清-kun-867ecf423f51", { promptBefore: "神社でおはらいをすると、心が", promptAfter: "といわれます。" }],
  ["kanji-g4-静-on-42431c619af6", {
    word: "安静", wordReading: "あんせい", targetKanji: ["安", "静"],
    promptBefore: "けがをしたので、", promptAfter: "にしました。",
  }],
  ["kanji-g4-席-on-747ec925806d", { promptBefore: "発表会の", promptAfter: "で、代表があいさつをしました。" }],
  ["kanji-g4-戦-kun-32a8a05f9fec", { promptBefore: "昔の", promptAfter: "のようすを、本で読みました。" }],
  ["kanji-g4-選-on-de9dbefb42d3", { promptBefore: "クラスの代表を決める", promptAfter: "をしました。" }],
  ["kanji-g4-折-kun-3a75f4c6db05", {
    word: "折り紙", wordReading: "おりがみ", targetKanji: ["折", "紙"],
    promptBefore: "休み時間に", promptAfter: "を作りました。",
  }],
  ["kanji-g4-説-kun-59446681ba76", {
    word: "説き明かす", wordReading: "ときあかす", targetKanji: ["説", "明"],
    promptBefore: "先生がなぞを", promptAfter: "話を聞きました。",
  }],
  ["kanji-g4-争-on-9e77357e8f25", {
    word: "競争", wordReading: "きょうそう", targetKanji: ["競", "争"],
    promptBefore: "運動会で", promptAfter: "をしました。",
  }],
  ["kanji-g4-束-on-a0db74d9712c", { promptBefore: "チームの", promptAfter: "を強めるために、声をかけ合いました。" }],
  ["kanji-g4-続-on-389f729dacde", { promptBefore: "暑い日に、体調をくずす人が", promptAfter: "しました。" }],
  ["kanji-g4-帯-kun-5e5e0de0828f", { promptBefore: "夕方になると、空が赤みを", promptAfter: "ように見えます。" }],
  ["kanji-g4-努-kun-006ebc2965de", { promptBefore: "毎日、時間を守るように", promptAfter: "ことにしています。" }],
  ["kanji-g4-徳-on-7e255e14bc9f", {
    word: "道徳", wordReading: "どうとく", targetKanji: ["道", "徳"],
    promptBefore: "学校の", promptAfter: "の時間に、相手の気持ちを考えました。",
  }],
  ["kanji-g4-熱-on-ce8a81d8bdf3", {
    word: "熱湯", wordReading: "ねっとう", targetKanji: ["熱", "湯"],
    promptBefore: "やかんの", promptAfter: "に気をつけました。",
  }],
  ["kanji-g4-票-on-f2c32579090f", { promptBefore: "クラスの係を、", promptAfter: "で決めました。" }],
  ["kanji-g4-不-on-f5a742da2f1f", { promptBefore: "人前で", promptAfter: "なふるまいをしないようにします。" }],
  ["kanji-g4-別-on-dfcce5863d8f", { promptBefore: "赤と青を", promptAfter: "して、箱に分けました。" }],
  ["kanji-g4-付-on-99cf334a8410", { promptBefore: "市役所で、書類の", promptAfter: "を受けました。" }],
  ["kanji-g4-府-on-d333fe76ed4f", { promptBefore: "都道", promptAfter: "の名前を地図で調べました。" }],
  ["kanji-g4-副-on-9fc56344a49d", { promptBefore: "家の人は、本業のほかに", promptAfter: "もしています。" }],
  ["kanji-g4-包-kun-169390740545", { promptBefore: "プレゼントを紙で", promptAfter: "ことにしました。" }],
  ["kanji-g4-包-on-0b299346f4a9", {
    word: "包丁", wordReading: "ほうちょう", targetKanji: ["包", "丁"],
    promptBefore: "料理で", promptAfter: "を使うときは、家の人といっしょにします。",
  }],
  ["kanji-g4-無-on-1ad9d2a1c2c2", { promptBefore: "名前のない", promptAfter: "の作品を見ました。" }],
  ["kanji-g4-念-on-2a4cd3764c7d", { promptBefore: "", promptAfter: "の大会に出場しました。" }],
  ["kanji-g4-敗-on-1bc956f6e44f", { promptBefore: "試合で", promptAfter: "しました。" }],
  ["kanji-g4-富-kun-1e9bab204253", { promptBefore: "この土地は水に", promptAfter: "ので、作物がよく育ちます。" }],
  ["kanji-g4-勇-kun-846b34344736", {
    word: "勇んで", wordReading: "いさんで", targetKanji: ["勇"],
    promptBefore: "", promptAfter: "出かけました。",
  }],
  ["kanji-g4-要-kun-c92a5c8c4d62", { promptBefore: "チームの", promptAfter: "になる選手です。" }],
  ["kanji-g4-養-on-859101ae7801", { promptBefore: "親が子どもを育てる", promptAfter: "の大切さを学びました。" }],
  ["kanji-g4-浴-kun-1ccbbb0392fb", { promptBefore: "急に水を", promptAfter: "のはやめましょう。" }],
  ["kanji-g4-利-kun-05d60d9baf0e", { promptBefore: "鼻が", promptAfter: "犬は、においをよくかぎ分けます。" }],
  ["kanji-g4-輪-on-ef82d29f1c22", {
    word: "車輪", wordReading: "しゃりん", targetKanji: ["車", "輪"],
    promptBefore: "自転車の", promptAfter: "を調べました。",
  }],
  ["kanji-g4-末-on-789483d2a95e", {
    word: "学期末", wordReading: "がっきまつ", targetKanji: ["学", "期", "末"],
    promptBefore: "", promptAfter: "に、できたことを思い出しました。",
  }],
  ["kanji-g4-末-on-d54bc69894d2", {
    word: "末子", wordReading: "まっし", targetKanji: ["末", "子"],
    promptBefore: "", promptAfter: "は家族でいちばん年下の子です。",
  }],
  ["kanji-g4-末-kun-f9c8cab96196", { promptBefore: "文の", promptAfter: "に答えを書きました。" }],
  ["kanji-g4-民-kun-e61e87a67739", { promptBefore: "昔の", promptAfter: "のくらしについて、本で学びました。" }],
  ["kanji-g4-労-on-663ac8cb76a1", { promptBefore: "働く人を守る", promptAfter: "のきまりについて学びました。" }],
  ["kanji-g4-働-on-ff19dd03ab1b", { promptBefore: "働く人を守る", promptAfter: "のきまりについて学びました。" }],
  ["kanji-g4-低-on-771a66c0b784", {
    word: "高低", wordReading: "こうてい", targetKanji: ["高", "低"],
    promptBefore: "声の", promptAfter: "に気をつけて発表を聞きました。",
  }],
  ["kanji-g4-底-on-a2f3d94c0237", {
    word: "海底", wordReading: "かいてい", targetKanji: ["海", "底"],
    promptBefore: "", promptAfter: "のようすを写真で見ました。",
  }],
  ["kanji-g4-奈-on-975dc7b621c8", {
    word: "奈良", wordReading: "なら", targetKanji: ["奈", "良"],
    promptBefore: "地図で", promptAfter: "の場所を調べました。",
  }],
  ["kanji-g4-望-on-798f494e3d4f", {
    word: "本望", wordReading: "ほんもう", targetKanji: ["本", "望"],
    promptBefore: "願いがかなって、", promptAfter: "だと思いました。",
  }],
  ["kanji-g4-連-kun-d4891e2923e9", {
    word: "連れて", wordReading: "つれて", targetKanji: ["連"],
    promptBefore: "家族を", promptAfter: "出かけました。",
  }],
  ["kanji-g4-連-kun-908c30c4bc62", {
    promptBefore: "作文に、思いついた言葉を", promptAfter: "ことにしました。",
  }],
  ["kanji-g4-冷-on-e7e019b0f082", {
    word: "冷気", wordReading: "れいき", targetKanji: ["冷", "気"],
    promptBefore: "外から", promptAfter: "が入ったので、戸をしめました。",
  }],
  ["kanji-g4-例-kun-1567fcbd44b4", { promptBefore: "絵に", promptAfter: "と、わかりやすくなります。" }],
  ["kanji-g4-潟-kun-manual", { promptBefore: "地図で「", promptAfter: "」をさがしました。" }],
  ["kanji-g4-陸-on-1eb0a41c44d6", { promptBefore: "船が", promptAfter: "に着きました。" }],
  ["kanji-g4-老-kun-3963db1d71b4", { promptBefore: "木も長い年月がたつと", promptAfter: "ことがあります。" }],
  ["kanji-g4-老-kun-2161891811db", {
    word: "老けて", wordReading: "ふけて", targetKanji: ["老"],
    promptBefore: "写真にうつると、顔が", promptAfter: "見えます。",
  }],
]);

const needsFix = new Map([
  ["kanji-g4-成-kun-6b7cd2bd96f3", "「成す」は4年生向けの自然な代替語が見つからず、文脈から漢字を想起しにくい"],
  ["kanji-g4-説-on-d1a13f6d8cf3", "「遊説（ゆうぜい）」は児童向けの語として難しく、代替語がない"],
  ["kanji-g4-浅-on-4065a84d4379", "「浅学（せんがく）」は児童向けの語として難しく、代替語がない"],
  ["kanji-g4-巣-on-684ddc25b07b", "「病巣（びょうそう）」は医学用語で児童向けの語として難しい"],
  ["kanji-g4-沖-on-db7f8278305d", "「沖天（ちゅうてん）」は児童向けの語として難しく、代替語がない"],
  ["kanji-g4-低-kun-9902b4b83961", "「低まる」は児童向けの自然な代替語が見つからない"],
  ["kanji-g4-博-on-2517a735a9d6", "「博労（ばくろう）」は古語・職業語で児童向けの語として難しい"],
  ["kanji-g4-阪-on-227b9a253828", "「阪神（はんしん）」は固有名詞に依存し、児童向けの一般語として扱いにくい"],
  ["kanji-g4-富-on-fa7dd17e1d1e", "「富強（ふうきょう）」は児童向けの語として難しく、代替語がない"],
  ["kanji-g4-富-kun-32e234a6403a", "「富（とみ）」は抽象的で児童向けの自然な文脈を作りにくい"],
  ["kanji-g4-法-on-a319471d7b47", "「法度（はっと）」は歴史語で児童向けの語として難しい"],
  ["kanji-g4-法-on-3bdd52040ed5", "「法主（ほっしゅ）」は宗教用語で児童向けの語として難しい"],
  ["kanji-g4-類-kun-b84c0c315d73", "「類い（たぐい）」は文語的で児童向けの語として難しい"],
  ["kanji-g4-兆-kun-b84c0b3c1399", "「兆す（きざす）」は児童向けの自然な代替語が見つからず、文脈から漢字を想起しにくい"],
]);

const rescued = new Set([
  "kanji-g4-群-kun-da56f4e60188",
  "kanji-g4-折-kun-3a75f4c6db05",
  "kanji-g4-説-kun-59446681ba76",
  "kanji-g4-低-on-771a66c0b784",
  "kanji-g4-底-on-a2f3d94c0237",
  "kanji-g4-奈-on-975dc7b621c8",
  "kanji-g4-包-on-0b299346f4a9",
  "kanji-g4-望-on-798f494e3d4f",
  "kanji-g4-末-on-789483d2a95e",
  "kanji-g4-末-on-d54bc69894d2",
  "kanji-g4-連-kun-908c30c4bc62",
  "kanji-g4-冷-on-e7e019b0f082",
]);

for (const material of source.materials) {
  const update = updates.get(material.pairId);
  if (update) {
    Object.assign(material, update);
    material.writingPrompt = `「${material.wordReading}」の漢字の部分を書こう`;
  }
  const reason = needsFix.get(material.pairId);
  if (reason) {
    material.reviewStatus = "needs-fix";
    material.reviewNote = reason;
  }
  if (rescued.has(material.pairId)) {
    material.reviewStatus = "draft";
    delete material.reviewNote;
  }
}

const missing = [...updates.keys(), ...needsFix.keys()].filter((pairId) =>
  !source.materials.some((material) => material.pairId === pairId));
if (missing.length > 0) throw new Error(`対象素材がありません: ${missing.join(", ")}`);

await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, "utf8");
console.log(`updated ${updates.size} materials, needs-fix ${needsFix.size} materials`);
