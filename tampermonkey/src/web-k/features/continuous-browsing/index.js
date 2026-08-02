import { ViewerSession } from './viewer-session.js';

export function createViewerSession(viewer, options = {}) {
  const { SessionClass = ViewerSession, ...sessionOptions } = options;
  return new SessionClass(viewer, sessionOptions);
}
