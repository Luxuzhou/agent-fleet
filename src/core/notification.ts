import type { FleetNotification, NotificationType } from '../types.js';

type SSESender = (sessionId: string, event: string, data: string) => void;

export class NotificationManager {
  private sender: SSESender | null = null;

  setSender(sender: SSESender): void {
    this.sender = sender;
  }

  notify(sessionId: string, type: NotificationType, payload: Partial<FleetNotification>): void {
    if (!this.sender) return;

    const notification: FleetNotification = {
      type,
      timestamp: Date.now(),
      ...payload,
    };

    this.sender(sessionId, 'fleet-notification', JSON.stringify(notification));
  }

  notifyOrchestrator(orchestratorSessionId: string | undefined, type: NotificationType, payload: Partial<FleetNotification>): void {
    if (!orchestratorSessionId) return;
    this.notify(orchestratorSessionId, type, payload);
  }
}
