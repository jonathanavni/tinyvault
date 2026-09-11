import type { FillAuthorization, FillAuthorizationLifecycle, FillReservation } from '../core/fillAuthorization';
import type { Handle } from '../core/types';

type HandleState = { granted: number; consumed: number; reserved: number };
type FillAuthorizationDomain = Readonly<{
  authorization: FillAuthorization;
  lifecycle: FillAuthorizationLifecycle;
}>;

export function createFillAuthorizationDomain(): FillAuthorizationDomain {
  const handles = new Map<Handle, HandleState>();
  const stateFor = (handle: Handle): HandleState => {
    let state = handles.get(handle);
    if (state === undefined) {
      state = { granted: 1, consumed: 0, reserved: 0 };
      handles.set(handle, state);
    }
    return state;
  };
  const authorization: FillAuthorization = Object.freeze({
    reserve(handle: Handle): FillReservation | null {
      const state = stateFor(handle);
      if (state.granted - state.consumed - state.reserved <= 0) return null;
      state.reserved += 1;
      return reservationFor(state);
    },
  });
  const lifecycle: FillAuthorizationLifecycle = Object.freeze({
    renew(handle: Handle): void { stateFor(handle).granted += 1; },
  });
  return Object.freeze({ authorization, lifecycle });
}

function reservationFor(state: HandleState): FillReservation {
  let settled = false;
  return Object.freeze({
    commit(): void {
      if (settled) return;
      settled = true;
      state.reserved -= 1;
      state.consumed += 1;
    },
    release(): void {
      if (settled) return;
      settled = true;
      state.reserved -= 1;
    },
  });
}
