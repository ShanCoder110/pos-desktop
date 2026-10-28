/** Shared gesture state for every management page's KPI row. */
export type KpiScrollState = {
  hidden: boolean;
  upGestures: number;
  direction: -1 | 0 | 1;
  lastAt: number;
};

export const initialKpiScroll: KpiScrollState = {
  hidden: false,
  upGestures: 0,
  direction: 0,
  lastAt: -Infinity,
};

/** Reserve a native upward scroll after the first completed gesture. */
export function shouldArmKpiBoundary(
  state: KpiScrollState,
  scrollTop: number,
  scrollRange: number,
) {
  return state.hidden && state.direction === -1 && scrollTop <= 1 && scrollRange >= 1;
}

export function crossedArmedKpiBoundary(armed: boolean, scrollTop: number) {
  return armed && scrollTop < 0.5;
}

/** A short input break separates gestures; arriving at the top does not. */
export function advanceKpiScroll(
  state: KpiScrollState,
  delta: number,
  at: number,
  atTop = false,
): KpiScrollState {
  if (delta === 0) return state;
  if (!atTop && Math.abs(delta) < 2) {
    // Small momentum still belongs to the current swipe, not a later gesture.
    return state.direction === 0 ? state : { ...state, lastAt: at };
  }
  const direction = delta > 0 ? 1 : -1;
  const newGesture = direction !== state.direction || at - state.lastAt > 60;
  if (direction === 1) return { hidden: true, upGestures: 0, direction, lastAt: at };
  const upGestures = Math.min(2, state.upGestures + (newGesture ? 1 : 0));
  // Arriving at the top does not reveal the overview. Only a fresh upward
  // gesture that STARTS at the top may reveal it, not the same swipe's tail.
  const reveal = atTop && newGesture && upGestures >= 2;
  return { hidden: state.hidden && !reveal, upGestures, direction, lastAt: at };
}
