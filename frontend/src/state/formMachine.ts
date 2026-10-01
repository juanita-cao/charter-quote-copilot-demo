export type LoadSource = "draft-banner" | "search" | "history";
export type BannerState = "HIDDEN" | "SHOWN" | "DISMISSED";

export interface LoadPayload<V = Record<string, unknown>> {
  source: LoadSource;
  kind: "quote" | "draft";
  values: V;
  /** Something the operator should know about the record (the backend estimated a PDA split). */
  notice?: "pdaSplitEstimated" | null;
}

export interface FormLifecycleState<V = Record<string, unknown>> {
  dirty: boolean;
  formVersion: number;
  pendingLoad: LoadPayload<V> | null;
  banner: BannerState;
}

export type FormEvent<V = Record<string, unknown>> =
  | { type: "userEdited" }
  | { type: "prefillApplied" }
  | { type: "formReset" }
  | { type: "loadRequested"; payload: LoadPayload<V> }
  | { type: "replaceConfirmed" }
  | { type: "replaceCancelled" }
  | { type: "saved"; version: number }
  | { type: "draftLatestLoaded"; exists: boolean }
  | { type: "dismissClicked" }
  | { type: "resumeClicked" }
  | { type: "loadApplied"; source: LoadSource };

export const initialFormState: FormLifecycleState<never> = {
  dirty: false,
  formVersion: 0,
  pendingLoad: null,
  banner: "HIDDEN",
};

const illegal = (state: FormLifecycleState<unknown>, event: { type: string }): never => {
  throw new Error(`formReducer: illegal event ${event.type} (banner=${state.banner}, pending=${state.pendingLoad !== null})`);
};

export function formReducer<V = Record<string, unknown>>(
  state: FormLifecycleState<V>,
  event: FormEvent<V>,
): FormLifecycleState<V> {
  const bumped = state.formVersion + 1;

  switch (event.type) {
    case "userEdited": // F-01, F-02
    case "prefillApplied": // F-14
      return { ...state, dirty: true, formVersion: bumped };

    case "formReset": // F-08
      return { ...state, dirty: false, formVersion: bumped };

    case "loadRequested":
      if (state.pendingLoad !== null) return illegal(state, event); // the confirm modal is modal
      return state.dirty
        ? { ...state, pendingLoad: event.payload } // F-04
        : { ...state, dirty: false, formVersion: bumped }; // F-03

    case "replaceConfirmed": // F-05
      return state.pendingLoad !== null
        ? { ...state, dirty: false, pendingLoad: null, formVersion: bumped }
        : illegal(state, event);

    case "replaceCancelled": // F-06
      return state.pendingLoad !== null ? { ...state, pendingLoad: null } : illegal(state, event);

    case "saved": // F-07, F-15, F-16
      return state.dirty && event.version === state.formVersion ? { ...state, dirty: false } : state;

    case "draftLatestLoaded": // F-09, F-10, F-13
      return state.banner === "HIDDEN" && event.exists ? { ...state, banner: "SHOWN" } : state;

    case "dismissClicked": // F-11
      return state.banner === "SHOWN" ? { ...state, banner: "DISMISSED" } : illegal(state, event);

    case "resumeClicked": // F-12
      return state.banner === "SHOWN" ? state : illegal(state, event);

    case "loadApplied": // F-17, F-18, F-19
      return state.banner === "SHOWN" && event.source === "draft-banner" ? { ...state, banner: "DISMISSED" } : state;
  }
}
