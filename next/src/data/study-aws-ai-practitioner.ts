/**
 * AWS Practitioner copy, read from the Svelte tree rather than copied.
 *
 * Same rule as `study.ts`: while both stacks exist, a shared input is
 * imported across rather than duplicated. `study-aws-ai-practitioner.ts`
 * is plain TypeScript with no framework dependency, so it needs no port.
 */
export * from '../../../src/lib/data/study-aws-ai-practitioner';
