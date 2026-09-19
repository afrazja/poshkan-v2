export type WorkerState = {
  enabled: boolean; online: boolean; lastSeen: string|null; lastCheck: string|null;
  summary: Record<string,number>|null;
};
