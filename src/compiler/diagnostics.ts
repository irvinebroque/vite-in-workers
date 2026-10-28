import type { RolldownError } from 'rolldown';
import type { Diagnostic } from '../protocol.ts';

// Compiler errors can carry either Vite/Rolldown's loc or a plugin's location.
type CompilerError = Partial<RolldownError> & { location?: RolldownError['loc'] };

export function diagnostic(error: unknown): Diagnostic {
  const details: CompilerError = error && typeof error === 'object' ? error : {};
  const location = details.loc ?? details.location;
  const message = (details.message ?? String(error)).replace(/\u001b\[[0-9;]*m/g, '');
  const renderedLocation = message.match(/tmp\/app\/([^:\n]+):(\d+):(\d+)/);
  return {
    message,
    file: (location?.file ?? details.id ?? renderedLocation?.[1])?.replace(/^\/tmp\/app\//, ''),
    line: location?.line ?? (renderedLocation ? Number(renderedLocation[2]) : undefined),
    column: location?.column ?? (renderedLocation ? Number(renderedLocation[3]) - 1 : undefined),
    frame: details.frame?.replace(/\u001b\[[0-9;]*m/g, '')
  };
}
