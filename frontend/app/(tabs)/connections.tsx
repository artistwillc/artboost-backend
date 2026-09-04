// ARTBOOST_VISUAL_PARITY_V3153
// ARTBOOST_IOS_CONNECT_DETERMINISTIC_V3109
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  StyleSheet,
  Text,
  View,
} from "react-native";
import ConnectionsContent from "./connections-content";

// CONNECT_INSTANT_MOUNT_SHELL_V350
// The route mounts a tiny native destination first so iOS navigation can complete
// before the full Connections lifecycle performs session/store/status work.
export default function ConnectionsScreen() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    const timer = setTimeout(() => {
      if (!cancelled) {
        setReady(true);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task.cancel?.();
    };
  }, []);

  return (
    <View
      style={styles.root}
      testID="artboost-screen-connect"
      nativeID="artboost-screen-connect"
      accessibilityLabel="Connections"
      collapsable={false}

      accessible={false}

      accessibilityElementsHidden={false}

      importantForAccessibility="yes"
    >
      {!ready ? (
        <View style={styles.boot}>
          <Text style={styles.title}>Connections</Text>
          <ActivityIndicator size="small" />
        </View>
      ) : (
        <ConnectionsContent />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(7, 6, 17, 0.92)",
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 16,
  },
});
