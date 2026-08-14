/** Alerta reutilizável para mensagens consistentes em mobile e web. */
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export type AlertMessage = {
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

// Caixa de mensagem estilizada no visual do site/app (substitui o Alert nativo).
export function AppAlert({
  alert,
  onClose,
}: {
  alert: AlertMessage | null;
  onClose: () => void;
}) {
  const buttons = alert?.buttons;
  return (
    <Modal
      visible={Boolean(alert)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{alert?.title}</Text>
          {alert?.message ? (
            <Text style={styles.message}>{alert.message}</Text>
          ) : null}
          {buttons && buttons.length > 0 ? (
            <View style={styles.buttonsRow}>
              {buttons.map((button, index) => {
                const isCancel = button.style === "cancel";
                const isDestructive = button.style === "destructive";
                return (
                  <Pressable
                    key={index}
                    style={[
                      styles.button,
                      isCancel && styles.buttonCancel,
                      isDestructive && styles.buttonDestructive,
                    ]}
                    onPress={() => {
                      onClose();
                      button.onPress?.();
                    }}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        isCancel && styles.buttonTextCancel,
                        isDestructive && styles.buttonTextDestructive,
                      ]}
                    >
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Pressable style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>OK</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(9,28,21,.56)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#F8FAF7",
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 24,
  },
  title: {
    color: "#193D31",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: "#65736B",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 10,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#1E7A55",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonCancel: {
    backgroundColor: "#EAF1ED",
  },
  buttonDestructive: {
    backgroundColor: "#FCECE9",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 15,
    fontWeight: "800",
  },
  buttonTextCancel: {
    color: "#68766F",
  },
  buttonTextDestructive: {
    color: "#B13B30",
  },
});