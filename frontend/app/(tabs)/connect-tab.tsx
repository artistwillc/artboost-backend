import React from "react";
import { View } from "react-native";
import ConnectionsScreen from "./connections";

// CONNECT_ROUTE_EXPLICIT_WRAPPER_V310
// Explicit route identity + stable destination evidence for real-device verification.
export default function ConnectTabScreen() {
  return (
    <View
      collapsable={false}
      style={{ flex: 1 }}
      testID="artboost-screen-connect"
      nativeID="artboost-screen-connect"
    >
      <ConnectionsScreen />
    </View>
  );
}
