// Records raw tracker frames into a SessionRecording (a fixture).

import {
  SessionRecorder,
  type HandFrame,
  type SessionMeta,
  type SessionRecording,
  type TrackerDelegate,
  type TrackerMode,
} from '@afterglow/core';
import type { Scenario } from './scenarios';

export interface CaptureContext {
  userAgent: string;
  recordedAt: string;
  videoWidth: number;
  videoHeight: number;
  tracker: TrackerMode;
  delegate: TrackerDelegate;
}

export class SessionCapture {
  private recorder = new SessionRecorder();
  private scenario: Scenario | null = null;
  private person: string | null = null;
  private recording = false;

  get active(): boolean {
    return this.recording;
  }

  get frameCount(): number {
    return this.recorder.frameCount;
  }

  /** `person` is an anonymous id for someone other than the main author; it prefixes the file name. */
  start(scenario: Scenario | null = null, person: string | null = null): void {
    this.recorder.clear();
    this.scenario = scenario;
    this.person = person;
    this.recording = true;
  }

  push(frame: HandFrame): void {
    if (this.recording) this.recorder.push(frame);
  }

  /** Discards the capture in progress. */
  cancel(): void {
    this.recording = false;
    this.recorder.clear();
    this.scenario = null;
    this.person = null;
  }

  /** Ends the capture and names the file after the scenario, if there is one. */
  finish(ctx: CaptureContext, fallbackName: string): { recording: SessionRecording; fileName: string } {
    this.recording = false;
    const meta: Omit<SessionMeta, 'fps'> = { ...ctx };
    if (this.scenario) {
      meta.scenario = this.scenario.id;
      meta.notes = this.scenario.instruction;
    }
    if (this.person) meta.person = this.person;
    const recording = this.recorder.finish(meta);
    const base = this.scenario?.id ?? fallbackName;
    const fileName = `${this.person ? `${this.person}-${base}` : base}.json`;
    this.recorder.clear();
    this.scenario = null;
    this.person = null;
    return { recording, fileName };
  }
}
