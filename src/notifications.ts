import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { ProductCategory } from "./types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function prepareNotifications(): Promise<boolean> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("validade", {
      name: "Avisos de validade",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function scheduleExpiryNotifications(
  productName: string,
  expiryIso: string,
  category: ProductCategory,
): Promise<string[]> {
  const allowed = await prepareNotifications();
  if (!allowed) return [];

  const ids: string[] = [];
  const expiry = new Date(`${expiryIso}T09:00:00`);
  const categoryAdvance =
    category === "Açougue" || category === "Frios/PAS"
      ? { days: 15, body: `${productName} vence em 15 dias.` }
      : { days: 30, body: `${productName} vence em 1 mês.` };

  const reminders = [
    categoryAdvance,
    { days: 7, body: `${productName} vence em 7 dias.` },
    { days: 1, body: `${productName} vence amanhã.` },
    { days: 0, body: `${productName} vence hoje.` },
  ];

  for (const reminder of reminders) {
    const trigger = new Date(expiry);
    trigger.setDate(trigger.getDate() - reminder.days);
    if (trigger.getTime() <= Date.now()) continue;
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: "Prazo Certo", body: reminder.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
          channelId: "validade",
        },
      }),
    );
  }
  return ids;
}

export async function cancelNotifications(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)),
  );
}
