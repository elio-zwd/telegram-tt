import { installDebugApi } from './debug-api.js';
import { createDebugProbes } from './probes.js';

export function createDebugFeature({ scriptId }) {
  const probes = createDebugProbes({ scriptId });
  return Object.freeze({
    clearCloseProbe: probes.clearCloseProbe,
    installDebugApi(scheduleScan) {
      installDebugApi({ scheduleScan, scriptId, probes });
    },
  });
}
