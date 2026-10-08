import { z } from 'zod';
import { AppError } from './errors';

/** Parse untrusted input against a schema, throwing a 422 with field-level issues on failure. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new AppError(
      'validation_failed',
      'Some fields are invalid.',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export const IdParam = z.object({ id: z.string().uuid() });
