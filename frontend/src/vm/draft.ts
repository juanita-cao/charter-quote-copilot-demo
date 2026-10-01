import type { CurrentUserProfile, DraftLatest } from "../api/types";
import { parseSnapshot, snapshotNotice } from "../form/load";
import type { BannerState } from "../state/formMachine";
import type { AccountVM, DraftBannerVM } from "./types";

export function buildDraftBannerVM(latest: DraftLatest | undefined, banner: BannerState): DraftBannerVM {
  if (!latest || latest.draft === null || latest.draft === undefined) {
    return { visible: false, savedAtIso: null, values: null, notice: null };
  }
  const values = parseSnapshot(latest.draft);
  return {
    visible: banner === "SHOWN" && values !== null,
    savedAtIso: latest.updated_at,
    values,
    notice: snapshotNotice(latest.draft),
  };
}

export function buildAccountVM(me: CurrentUserProfile | undefined): AccountVM {
  return { label: me?.company_name ?? "Account" };
}
