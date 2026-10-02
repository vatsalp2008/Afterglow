import type { StartError } from './store';

/** What went wrong starting the camera or hand tracking, and what to do about it. */
export const ERROR_COPY: Record<StartError, string> = {
  denied: 'Camera access is blocked. Allow it from the camera icon in the address bar, then try again.',
  notFound: 'No camera was found. Connect one and try again.',
  inUse: 'Your camera is being used by another app. Close it and try again.',
  unsupported: 'This browser can’t use the camera here. Try a current version of Chrome, Edge, or Firefox.',
  model: 'Hand tracking didn’t load. Check your connection and try again.',
  fixture: 'That recorded session couldn’t be loaded. Check the fixture name in the address bar.',
  unknown: 'The camera couldn’t start. Try again, or paint without the camera for now.',
};
