import {
  SECRET_TRANSFORM_NAMES,
  matchesTransform,
  secretTransforms,
  type SecretTransformName,
} from '../shared/secretTransforms';

export function firstMatchingSecretTransform(
  bytes: string,
  canary: string,
  enabled: ReadonlySet<SecretTransformName>,
): SecretTransformName | null {
  const transforms = new Map(secretTransforms(canary).map((item) => [item.name, item.value]));
  for (const name of SECRET_TRANSFORM_NAMES) {
    if (!enabled.has(name)) continue;
    const value = transforms.get(name);
    if (value !== undefined && matchesTransform(bytes, canary, name, value)) return name;
  }
  return null;
}
