// Closed-code tests inspect only synthetic errors; they do not certify peer identity.
import { expect, it } from 'vitest';
import { BRIDGE_CODES, BridgeError, errorCode, isBridgeCode } from './protocol';

it('closed errors cannot carry free text or accept a forged provenance clone', () => {
  for (const code of BRIDGE_CODES) {
    const error = new BridgeError(code);
    expect(error.message).toBe(code);
    expect(errorCode(error)).toBe(code);
    expect(Object.isFrozen(error)).toBe(true);
    const clone = Object.create(Object.getPrototypeOf(error), Object.getOwnPropertyDescriptors(error));
    expect(errorCode(clone)).toBe('bridge-closed');
  }
  expect(new BridgeError('synthetic free text' as never).message).toBe('bridge-closed');
  expect(errorCode(new Error('synthetic free text'))).toBe('bridge-closed');
  expect(isBridgeCode('synthetic free text')).toBe(false);
});
