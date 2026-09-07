import type { BackendStatus } from '../backends/backend';
import type { FillResult, ItemMeta, SetupReason, VaultTools } from '../core/types';
import type { PublicTaskRecipe } from '../../testbed/scenarios/types';
import { prepareProfile, projectTask, referenceSystem } from './prompt';

export type ReferenceBootstrap = PublicTaskRecipe & { inventory: { items: ItemMeta[] } };
export type SetupBlocked = Readonly<{ status: 'setup-blocked'; diagnostic: 'agent-setup-blocked'; reason: SetupReason; instruction: string }>;

export class AgentProfileMetadataError extends Error {
  constructor() { super('Invalid inventory metadata'); this.name = 'AgentProfileMetadataError'; }
}

/** Trusted discovery/setup is out of band, before any model factory or turn. */
export async function createReferenceProfile(options: {
  runId: string; task: PublicTaskRecipe; skillText: string;
  vault: Pick<VaultTools, 'list_vault' | 'request_vault_setup'>;
  probeAvailability: () => Promise<BackendStatus>;
  /** Bind the existing FillService.setupReasonFor; it probes availability without backend details. */
  setupReasonFor: (result: FillResult) => Promise<SetupReason | null>;
}) {
  const task = projectTask(options.task, options.runId);
  const system = referenceSystem(options.skillText);
  let inventory: Awaited<ReturnType<VaultTools['list_vault']>> | undefined;
  let listFailed = false;
  try { inventory = await options.vault.list_vault(); }
  catch { listFailed = true; }
  let items: ItemMeta[] = [];
  if (!listFailed) {
    try {
      const rawItems = inventory!.items;
      if (!Array.isArray(rawItems)) throw new AgentProfileMetadataError();
      items = rawItems.map(projectItem);
    } catch { throw new AgentProfileMetadataError(); }
  }
  // Availability is distinct from item metadata; stale available:true cannot admit a locked backend.
  let backendAvailable = false;
  try { backendAvailable = (await options.probeAvailability()).available === true; }
  catch { /* A failed probe is unavailable; no backend details enter the diagnostic. */ }
  if (listFailed || !backendAvailable || !items.some(item => item.available && item.kind === 'password')) {
    const failure = listFailed || !backendAvailable ? 'backend-error' : 'handle-unavailable';
    const reason = await options.setupReasonFor({ ok: false, reason: failure }).catch(() => null)
      ?? (failure === 'handle-unavailable' ? 'missing_item' : 'backend_unavailable');
    const { instruction } = await options.vault.request_vault_setup({ reason });
    return Object.freeze({ status: 'setup-blocked', diagnostic: 'agent-setup-blocked', reason, instruction }) as SetupBlocked;
  }
  const bootstrapTask: ReferenceBootstrap = { ...task, inventory: { items } };
  return prepareProfile('tinyvault-ref', options.runId, system, bootstrapTask);
}

function projectItem(item: ItemMeta): ItemMeta {
  const { handle, label, kind, available, account } = item;
  if (typeof handle !== 'string' || typeof label !== 'string'
    || !['password', 'totp'].includes(kind) || typeof available !== 'boolean'
    || (account !== undefined && typeof account !== 'string')) throw new AgentProfileMetadataError();
  return { handle, label, kind, ...(account === undefined ? {} : { account }), available };
}
