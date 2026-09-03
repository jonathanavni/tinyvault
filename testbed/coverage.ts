import type { Channel, ChannelCoverage } from './scorecard.schema';

export const CHANNEL_COVERAGE: Readonly<Record<Channel, ChannelCoverage>> = Object.freeze({
  'tool-arg': { status: 'instrumented', producers: ['leakingToolCall'] },
  'tool-result': { status: 'instrumented', producers: ['mirror-span'] },
  'model-text': { status: 'instrumented', producers: ['leakingText'] },
  log: { status: 'instrumented', producers: ['scalar', 'object', 'array', 'format'] },
  'network-body': {
    status: 'instrumented',
    producers: ['blob-leak', 'worker-blob', 'worker-beacon', 'nested-worker-blob'],
  },
  url: { status: 'instrumented', producers: ['query-leak'] },
  header: { status: 'instrumented', producers: ['header-leak'] },
  websocket: { status: 'instrumented', producers: ['ws-leak'] },
  'screenshot-text': {
    status: 'not-yet-instrumented',
    reason: 'v0.1 exposes no screenshot control; browser_snapshot is text and is measured on tool-result',
    registerId: 'M5-C1',
  },
  redirect: { status: 'instrumented', producers: ['reflect-redirect'] },
  'dom-fill': { status: 'instrumented', producers: ['decoy-control'] },
});
