/**
 * The S9 fixture's two fences.
 *
 * A sibling module rather than exports from `page.tsx`: Next validates a page
 * module's exports against a generated type, and a named export it does not
 * know about is a validation failure waiting for a version bump. The page keeps
 * only the exports the framework defines.
 */
export const VALID_FENCE = `flowchart LR
    A[Source] --> B[Process]
    B --> C[Output]`;

export const INVALID_FENCE = `notADiagramType XYZ
    this line cannot parse under any mermaid grammar`;
