import { Notification, NotificationService } from './types';

export class PushbulletService implements NotificationService {
  async sendNotification(notification: Notification, token: string): Promise<void> {
    const { title, body, url } = notification;

    const payload: Record<string, string> = {
      type: 'note',
      title: title,
      body: body,
    };

    if (url) {
      payload.type = 'link';
      payload.url = url;
    }

    const response = await fetch('https://api.pushbullet.com/v2/pushes', {
      method: 'POST',
      headers: {
        'Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Pushbullet API error: ${response.status} - ${errorText}`);
    }
  }
}
