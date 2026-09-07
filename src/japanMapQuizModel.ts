export type JapanMapAnswerState = {
  selectedId: string | null;
  mistakes: number;
  usedGuide: boolean;
  revealed: boolean;
  solved: boolean;
};

export function createJapanMapAnswerState(): JapanMapAnswerState {
  return { selectedId: null, mistakes: 0, usedGuide: false, revealed: false, solved: false };
}

export function submitJapanMapAnswer(
  state: JapanMapAnswerState,
  correctId: string,
  selectedId: string,
): JapanMapAnswerState {
  if (state.solved || state.revealed) return state;
  if (selectedId === correctId) return { ...state, selectedId, solved: true };
  return { ...state, selectedId, mistakes: state.mistakes + 1 };
}

export function revealJapanMapAnswer(state: JapanMapAnswerState): JapanMapAnswerState {
  if (state.solved || state.revealed) return state;
  return {
    ...state,
    selectedId: null,
    mistakes: state.usedGuide ? state.mistakes : state.mistakes + 1,
    usedGuide: true,
    revealed: true,
  };
}

export function hideJapanMapAnswer(state: JapanMapAnswerState): JapanMapAnswerState {
  return state.revealed ? { ...state, revealed: false, selectedId: null } : state;
}
