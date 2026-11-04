import type { z } from "zod";

import type { components } from "@/lib/api/schema.gen";

export type ApiSchemas = components["schemas"];

/**
 * Ties a hand-written zod schema to a generated OpenAPI type at compile time.
 * A plain `satisfies z.ZodType<T>` only checks one direction, so it would miss a
 * field the API dropped; this rejects the schema when either side has drifted.
 * Regenerate the types with `npm run gen:api`.
 */
export function exactSchema<T>() {
  return <S extends z.ZodType<T>>(schema: S & ([T] extends [z.output<S>] ? unknown : never)): S => schema;
}
