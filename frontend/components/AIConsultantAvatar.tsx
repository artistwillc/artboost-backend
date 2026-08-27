import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  size?: number;
  label?: string;
  onPress?: () => void;
  compact?: boolean;
  active?: boolean;
};

const CONSULTANT_IMAGE = require("../assets/images/artboost-ai-consultant.jpg");

export default function AIConsultantAvatar({
  size = 92,
  label,
  onPress,
  compact = false,
  active = false,
}: Props) {
  const breathe = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: active ? 700 : 1550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: active ? 700 : 1550,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2100,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const tiltLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(tilt, { toValue: 0, duration: 2800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );

    breatheLoop.start();
    floatLoop.start();
    tiltLoop.start();
    return () => {
      breatheLoop.stop();
      floatLoop.stop();
      tiltLoop.stop();
    };
  }, [active, breathe, float, tilt]);

  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, active ? 1.055 : 1.025] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.28, active ? 0.9 : 0.62] });
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [2, -3] });
  const rotate = tilt.interpolate({ inputRange: [0, 1], outputRange: ["-1.2deg", "1.2deg"] });

  const avatar = (
    <View style={styles.row}>
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
              transform: [{ scale: breatheScale }],
            },
          ]}
        />
        <Animated.View
          style={{
            width: size,
            height: size,
            transform: [
              { translateY },
              { rotate },
              { scale: Animated.multiply(breatheScale, press) },
            ],
          }}
        >
          <Animated.Image
            source={CONSULTANT_IMAGE}
            resizeMode="cover"
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lifeRing,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                opacity: glowOpacity,
              },
            ]}
          />
          {active ? <View pointerEvents="none" style={styles.activeDot} /> : null}
        </Animated.View>
      </View>
      {label ? (
        <View style={[styles.textWrap, compact && styles.textWrapCompact]}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>AI CONSULTANT</Text>
            {active ? <Text style={styles.working}>WORKING</Text> : null}
          </View>
          <Text style={styles.label}>{label}</Text>
          {!compact ? <Text style={styles.subLabel}>Tap to talk with your ArtBoost marketing agent.</Text> : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return avatar;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.spring(press, { toValue: 0.94, friction: 6, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 5, useNativeDriver: true }).start()}
      accessibilityRole="button"
      accessibilityLabel="Open AI Consultant"
    >
      {avatar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  glow: {
    position: "absolute",
    backgroundColor: "#6d28d9",
    shadowColor: "#ff42c6",
    shadowOpacity: 1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  lifeRing: {
    position: "absolute",
    top: 0,
    left: 0,
    borderWidth: 1.5,
    borderColor: "#65e8ff",
    shadowColor: "#ff42c6",
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  activeDot: {
    position: "absolute",
    right: 4,
    bottom: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#4dff9b",
    borderWidth: 2,
    borderColor: "#06120c",
  },
  textWrap: { flex: 1, minWidth: 0 },
  textWrapCompact: { marginLeft: 2 },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  kicker: { color: "#b8a8ff", fontSize: 10, fontWeight: "900", letterSpacing: 1.6 },
  working: { color: "#83f7ba", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  label: { color: "#ffffff", fontSize: 17, fontWeight: "900", marginTop: 3 },
  subLabel: { color: "#b8b8c8", fontSize: 12, lineHeight: 17, marginTop: 4 },
});
