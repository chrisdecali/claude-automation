export interface Notification {
  title: string;
  body: string;
  url?: string;
}

export interface NotificationService {
  sendNotification(notification: Notification, token: string): Promise<void>;
}
