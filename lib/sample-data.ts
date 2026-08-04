import { Machine } from "./types";

// 数値はUI動作確認用のサンプルです。実戦利用前に必ず出典を確認・修正してください。
export const initialMachines: Machine[] = [
  {
    id: "sample-1",
    name: "サンプル機種A",
    kana: "さんぷるきしゅえー",
    maker: "サンプルメーカー",
    aliases: ["機種A", "sample a"],
    memo: "動作確認用データです。実在機種の攻略情報ではありません。",
    updatedAt: "2026-08-04",
    strategies: [
      {
        id: "sample-1-normal",
        type: "天井",
        label: "通常時天井狙い",
        startGames: 500,
        ceilingGames: 999,
        condition: "通常時・状態不問",
        stopRule: "終了画面と前兆を確認してヤメ",
        sourceName: "手動登録（サンプル）",
        sourceUrl: "",
        verified: false
      },
      {
        id: "sample-1-reset",
        type: "リセット",
        label: "リセット狙い",
        startGames: 250,
        ceilingGames: 650,
        condition: "当日リセット濃厚",
        stopRule: "規定状態を確認してヤメ",
        sourceName: "手動登録（サンプル）",
        sourceUrl: "",
        verified: false
      }
    ]
  },
  {
    id: "sample-2",
    name: "サンプル機種B",
    kana: "さんぷるきしゅびー",
    maker: "テスト工業",
    aliases: ["機種B", "sample b"],
    memo: "検索・候補台登録の確認用です。",
    updatedAt: "2026-08-04",
    strategies: [
      {
        id: "sample-2-zone",
        type: "ゾーン",
        label: "ゾーン狙い",
        startGames: 300,
        ceilingGames: 350,
        condition: "300G台のゾーン",
        stopRule: "ゾーン抜け後にヤメ",
        sourceName: "手動登録（サンプル）",
        sourceUrl: "",
        verified: false
      }
    ]
  }
];
