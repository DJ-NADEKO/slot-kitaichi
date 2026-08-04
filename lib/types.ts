export type StrategyType = "天井" | "ゾーン" | "リセット" | "AT後" | "CZ後" | "その他";

export type Strategy = {
  id: string;
  type: StrategyType;
  label: string;
  startGames: number | null;
  ceilingGames?: number | null;
  condition: string;
  stopRule: string;
  sourceName: string;
  sourceUrl: string;
  verified: boolean;
};

export type Machine = {
  id: string;
  name: string;
  kana: string;
  maker: string;
  aliases: string[];
  strategies: Strategy[];
  memo: string;
  updatedAt: string;
};

export type Candidate = {
  id: string;
  machineId: string;
  storeName: string;
  machineNumber: string;
  currentGames: number;
  strategyId: string;
  state: string;
  memo: string;
  createdAt: string;
};
