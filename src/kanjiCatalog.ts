export type KanjiGrade = 3 | 4;

export type KanjiCatalogEntry = {
  character: string;
  grade: KanjiGrade;
};

// 文部科学省「小学校学習指導要領（平成29年告示）」学年別漢字配当表。
// https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/03/18/1387017_011.pdf
const GRADE_3 = "悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和";
const GRADE_4 = "愛案以衣位茨印英栄媛塩岡億加果貨課芽賀改械害街各覚潟完官管関観願岐希季旗器機議求泣給挙漁共協鏡競極熊訓軍郡群径景芸欠結建健験固功好香候康佐差菜最埼材崎昨札刷察参産散残氏司試児治滋辞鹿失借種周祝順初松笑唱焼照城縄臣信井成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲沖兆低底的典伝徒努灯働特徳栃奈梨熱念敗梅博阪飯飛必票標不夫付府阜富副兵別辺変便包法望牧末満未民無約勇要養浴利陸良料量輪類令冷例連老労録";

function entries(characters: string, grade: KanjiGrade): KanjiCatalogEntry[] {
  return Array.from(characters, (character) => ({ character, grade }));
}

export const KANJI_CATALOG: KanjiCatalogEntry[] = [
  ...entries(GRADE_3, 3),
  ...entries(GRADE_4, 4),
];

export function getKanjiByGrade(grade: KanjiGrade): KanjiCatalogEntry[] {
  return KANJI_CATALOG.filter((entry) => entry.grade === grade);
}
