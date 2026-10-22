import * as core from "@community-bots/core";
import {
  claimable as fallbackClaimable,
  resolveApprovalWave as fallbackWave,
  type WaveApproval,
  type WaveDecision,
} from "./fallback";

type WaveFn = (approvals: WaveApproval[], round: number) => WaveDecision;
type ClaimFn = (status: string) => boolean;

const extra = core as typeof core & {
  resolveApprovalWave?: WaveFn;
  claimable?: ClaimFn;
};

/** Core's helper when it is exported, otherwise the local copy in fallback.ts. */
export const resolveApprovalWave: WaveFn = extra.resolveApprovalWave ?? fallbackWave;
export const claimable: ClaimFn = extra.claimable ?? fallbackClaimable;
