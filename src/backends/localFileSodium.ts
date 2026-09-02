import sodium from 'libsodium-wrappers';

export const LOCAL_KEY_BYTES = 32;
export const LOCAL_HANDLE_BYTES = 16;
export const LOCAL_NONCE_BYTES = 24;
export const LOCAL_TAG_BYTES = 16;

export type Awaitable<T> = T | Promise<T>;

/** The single injectable seam through which this slice accesses libsodium. */
export interface SealingPrimitives {
  randomKey(): Awaitable<Uint8Array>;
  randomHandle(): Awaitable<Uint8Array>;
  randomNonce(): Awaitable<Uint8Array>;
  seal(
    plaintext: Uint8Array,
    additionalData: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Awaitable<Uint8Array>;
  open(
    ciphertext: Uint8Array,
    additionalData: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Awaitable<Uint8Array>;
  memzero(buffer: Uint8Array): Awaitable<void>;
}

export const defaultSealingPrimitives: SealingPrimitives = Object.freeze({
  async randomKey(): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.randombytes_buf(LOCAL_KEY_BYTES);
  },
  async randomHandle(): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.randombytes_buf(LOCAL_HANDLE_BYTES);
  },
  async randomNonce(): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  },
  async seal(
    plaintext: Uint8Array,
    additionalData: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      additionalData,
      null,
      nonce,
      key,
    );
  },
  async open(
    ciphertext: Uint8Array,
    additionalData: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Promise<Uint8Array> {
    await sodium.ready;
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      additionalData,
      nonce,
      key,
    );
  },
  async memzero(buffer: Uint8Array): Promise<void> {
    await sodium.ready;
    sodium.memzero(buffer);
  },
});
