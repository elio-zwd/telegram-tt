import { ViewerSession } from './viewer-session.js';

export function createViewerSession(viewer, options) {
  return new ViewerSession(viewer, options);
}
