import { Candidate, Machine } from "./types";

export function getCandidateScore(candidate: Candidate, machine?: Machine) {
  const strategy = machine?.strategies.find((item) => item.id === candidate.strategyId);
  if (!strategy || strategy.startGames === null) {
    return { score: -999, difference: null, rank: "未判定" as const };
  }
  const difference = candidate.currentGames - strategy.startGames;
  const score = difference;
  const rank = difference >= 100 ? "最優先" : difference >= 0 ? "狙い目" : difference >= -50 ? "近い" : "待ち";
  return { score, difference, rank };
}
