export const FUNCTION_ALLOWLISTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'src/browser/session.ts': [
    'constructor', 'openSession', 'catch#callback0', 'closeSession',
    // The walker labels private #closeSession as <anonymous>; it pins ordered close qualification.
    '<anonymous>', 'stopLoading', 'quiesceControls',
    'map#callback0', // quiesceControls: courtesy, stop, holder settlement and suspension per session.
    'then#callback0', // Discard the suspension reply, retaining void completion.
    'catch#callback0', // Own suspension rejection until context disposal.
    'abortSessions', 'map#callback0', // abortSessions: await each owned context's emergency close.
    'disposeSession', // Trusted operation-expiry context disposal, retaining holder settlement.
    '<anonymous>', // #retireFailedSessions moves failed cohort members out of live admission.
    'runExclusive',
    '#withSession#callback1', 'runControl', '#withSession#callback1', 'openSessionCount', 'closeAll',
    'map#callback0', 'catch#callback0',
    'map#callback0', // closeAll: await close promises already owned by live or failed sessions.
    '<anonymous>', '<anonymous>', 'runExclusive#callback1',
    'createBrowserSessionHost', 'newSessionState', 'attachLifecycle', 'on#callback1', 'on#callback1',
    'on#callback1', 'on#callback1', // Context-close latch qualifies contexts without a Browser owner.
    'initializeCdp', 'eventFrame', 'isMainFrame', 'resetDocument', 'closePageState',
    'sendCloseLifecycle', 'courtesyWait', '<anonymous>', // Await the admitted holder within the existing courtesy budget.
    'waitForLoad', 'catch#callback0', 'disposeState', 'catch#callback0',
    'releasePinnedObjects', 'map#callback0', 'createFillPort', 'documentEpoch', 'observeTop',
    'pinPasswordDestination', 'observeTop', 'pinDestination', 'resolveMainNode', 'reasonFromChildFrames',
    'frameOrigin', 'evaluate#callback0', 'pinnedOutcome', 'injectDestination', 'catch#callback0',
    'tooLongOutcome', 'unplaceableOutcome', 'toFixedHex', 'normalizeInjectOutcome', 'originOutcome',
    'transportOutcome', 'nullableString', 'removeTaint', 'filter#callback0', 'createSessionPage',
    'navigate', 'click', 'type', 'snapshot', 'navigatePage', 'predicate', 'catch#callback0',
    'clickOnPage', 'typeOnPage', 'snapshotPage', 'map#callback0', 'map#callback0',
    'resolveTaintedObjects', 'map#callback0', 'normalizeSnapshot', 'isSnapshotNode', 'every#callback0',
    'isTainted', 'some#callback0', 'isolatedWorld', 'resolveObject', 'resolveNodeId', 'callFunctionOn',
    'disposePinnedObject', 'releaseObject', 'catch#callback0', 'isRecord',
    'missingPageTarget', // Classify ordinary target loss without escalating infrastructure failure.
    'contextRemoved', // Qualify and retire emergency-disposal entries.
    'suspendScripts', // Apply the advisory cutoff while retaining the actual CDP command.
    'catch#callback0', // Settle the locally cancelled advisory timer.
  ],
  'src/core/fillService.ts': [
    'createFillService', 'fill', 'listVault', 'requestSetup', 'setupReasonFor', 'disposeBackend',
    'fill', 'runExclusive#callback1', 'fillExclusive', 'continueWithPolicy', 'continueWithDestination',
    'completeInjection', 'staleOutcome', 'refusedInjection', 'resolvePolicy', 'setupReasonFor',
    'validateRequest', 'boundaryFailure', 'readSessionId', 'safeEpoch', 'mapBackendFailure',
    'mapOuterFailure', 'emptyObservation', 'failedOutcome', 'successfulOutcome', 'finish',
    'freezeObservation', 'isRecord',
  ],
  'src/backends/localFile.ts': [
    'createLocalFileBackend', 'readVault', 'probeAvailability', 'listItems', 'map#callback0',
    'resolvePolicy', 'resolveSecret', 'dispose', 'findRecord', 'find#callback0', 'policiesEqual',
    'every#callback0', 'openRecordSecret', 'decryptRecord', 'isMissingError',
  ],
  'src/backends/localFileSodium.ts': [
    'randomKey', 'randomHandle', 'randomNonce', 'seal', 'open', 'memzero',
  ],
  'src/backends/localFileFormat.ts': [
    'isValidFieldRecipe', 'every#callback0', 'encodeAdditionalData', 'parseLocalVaultBytes',
    'validateLocalVaultFile', 'map#callback0', 'validateRecord', 'isValidRecordShape',
    'decodeCanonicalBase64', 'isValidLocalHandle', 'policyFromRecord', 'hasExactKeys',
    'every#callback0', 'every#callback0', 'isObject', 'invalidVault',
  ],
  'src/core/redaction.ts': [
    'constructor', 'expose', 'consume', 'clear', 'toString', 'toJSON', 'inspect.custom',
  ],
});
