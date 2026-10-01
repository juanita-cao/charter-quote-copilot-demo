import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Api } from "../api/api";
import type { PrecisionMode, QuoteInput, RegisterInput } from "../api/types";
import { classifyDelete, partitionTargets, type DeleteOutcome, type DeletePart } from "./deleteTargets";
import { QUERY_KEYS } from "./queryKeys";

export function useSaveQuote(api: Api) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ form, targetTce, precisionMode }: { form: QuoteInput; targetTce?: number; precisionMode?: PrecisionMode }) =>
      api.saveQuote(form, targetTce, precisionMode),
    onSuccess: async (res) => {
      if (!res.success) return; // SOFT failure: nothing was saved, nothing to refresh
      await Promise.all([qc.invalidateQueries({ queryKey: QUERY_KEYS.historyAll }), qc.invalidateQueries({ queryKey: QUERY_KEYS.companyRoutes })]);
    },
  });
}

export function useExportRecords(api: Api) {
  return useMutation({ mutationFn: (recordKeys: string[]) => api.exportRecords(recordKeys) });
}

export function useSaveDraft(api: Api) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rawForm }: { rawForm: Record<string, unknown> }) => api.saveDraft(rawForm),
    onSuccess: async (res) => {
      if (!res.success) return;
      await Promise.all([qc.invalidateQueries({ queryKey: QUERY_KEYS.historyAll }), qc.invalidateQueries({ queryKey: QUERY_KEYS.latestDraft })]);
    },
  });
}

async function runPart(requested: number[], call: (ids: number[]) => Promise<{ deleted_count: number }>): Promise<DeletePart> {
  if (requested.length === 0) return { requested: 0, deleted: 0, ok: true };
  try {
    const res = await call(requested);
    return { requested: requested.length, deleted: res.deleted_count, ok: true };
  } catch {
    return { requested: requested.length, deleted: 0, ok: false };
  }
}

// Deletes from the frozen target keys (H-09); a side with no ids is skipped, and one side failing never hides the other's result.
export function useBulkDelete(api: Api) {
  const qc = useQueryClient();
  return useMutation<DeleteOutcome, Error, string[]>({
    mutationFn: async (targetKeys) => {
      const { quoteIds, draftIds } = partitionTargets(targetKeys);
      const [quotes, drafts] = await Promise.all([
        runPart(quoteIds, (ids) => api.bulkDeleteQuotes(ids)),
        runPart(draftIds, (ids) => api.bulkDeleteDrafts(ids)),
      ]);
      return classifyDelete({ quotes, drafts });
    },
    onSuccess: async (result) => {
      if (result.outcome !== "allFailed") await qc.invalidateQueries({ queryKey: QUERY_KEYS.historyAll });
    },
  });
}

export function useLogin(api: Api) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.me }),
  });
}

// Demo deployment only: no credentials, logs straight into the seeded demo account.
export function useDemoLogin(api: Api) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.demoLogin(),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.me }),
  });
}

// Everything the server owns is dropped on logout / session expiry; a failed logout clears nothing (A-09).
export function useLogout(api: Api) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => qc.clear(),
  });
}

export function useRegister(api: Api) {
  return useMutation({ mutationFn: (input: RegisterInput) => api.register(input) });
}
