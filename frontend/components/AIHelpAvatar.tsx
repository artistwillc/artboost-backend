import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

const HELP_IMAGE = require("../assets/images/artboost-ai-help.jpg");

export default function AIHelpAvatar({ size = 44 }: { size?: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulseLoop.start();
    floatLoop.start();
    swayLoop.start();
    return () => {
      pulseLoop.stop();
      floatLoop.stop();
      swayLoop.stop();
    };
  }, [float, pulse, sway]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0.78] });
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [1.5, -2.5] });
  const rotate = sway.interpolate({ inputRange: [0, 1], outputRange: ["-1.4deg", "1.4deg"] });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: glowOpacity,
            transform: [{ scale }],
          },
        ]}
      />
      <Animated.Image
        source={HELP_IMAGE}
        resizeMode="cover"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          transform: [{ translateY }, { rotate }, { scale }],
        }}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: glowOpacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    backgroundColor: "#5f2eea",
    shadowColor: "#ff4dc4",
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    borderWidth: 1.25,
    borderColor: "#55e7ff",
    shadowColor: "#ff4dc4",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
