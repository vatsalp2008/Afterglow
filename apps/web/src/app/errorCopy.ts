import type { StartError } from './store';

/** What went wrong starting the camera or hand tracking, and what to do about it. */
export const ERROR_COPY: Record<StartError, string> = {
  denied:
    'Camera access is blocked for this site. To allow it, click the camera or lock icon in the address bar, set Camera to Allow, then try again.',
  dismissed: 'The camera prompt was closed. Try again and choose Allow when your browser asks.',
  notFound: 'No camera was found. Connect one and try again.',
  inUse: 'Your camera is being used by another app. Close it and try again.',
  insecure: 'The camera only works on a secure page. Open Afterglow from its https address.',
  unsupported: 'This browser can’t use the camera here. Try a current version of Chrome, Edge, or Firefox.',
  model: 'Hand tracking didn’t load. Check your connection and try again, or paint without the camera.',
  fixture: 'That recorded session couldn’t be loaded. Check the fixture name in the address bar.',
  unknown: 'The camera couldn’t start. Try again, or paint without the camera for now.',
};

/** Trying again can't help: the page or the browser can't use a camera at all. */
export const CAMERA_IMPOSSIBLE: ReadonlySet<StartError> = new Set(['insecure', 'unsupported']);
