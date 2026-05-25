export enum StartTime {
  DocumentStart,
  DocumentBody,
  DocumentEnd,
}

export interface Feature {
  name: string;
  description: string;
  executionTime: StartTime;

  shouldRun: () => Promise<boolean> | boolean;
  run: () => Promise<void> | void;
}
