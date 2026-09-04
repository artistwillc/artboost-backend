import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export type AIConsultantVisualState =
  | "idle"
  | "blink"
  | "focused"
  | "listening"
  | "thinking"
  | "working"
  | "responseReady"
  | "complete";

type Props = {
  size?: number;
  label?: string;
  onPress?: () => void;
  compact?: boolean;
  active?: boolean;
  state?: AIConsultantVisualState;
  animate?: boolean;
};

const CONSULTANT_IMAGE = require("../assets/images/artboost-ai-consultant.jpg");

const STATE_LABELS: Record<AIConsultantVisualState, string> = {
  idle: "LIVE",
  blink: "LIVE",
  focused: "FOCUSED",
  listening: "LISTENING",
  thinking: "THINKING",
  working: "WORKING",
  responseReady: "READY",
  complete: "COMPLETE",
};

export default function AIConsultantAvatar({
  size = 92,
  label,
  onPress,
  compact = false,
  active = false,
  state,
  animate = true,
}: Props) {
  const visualState: AIConsultantVisualState =
    state || (active ? "working" : "idle");
  const energized = visualState !== "idle" && visualState !== "blink";
  const [reduceMotion, setReduceMotion] = useState(false);

  const breathe = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(Boolean(enabled));
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(Boolean(enabled))
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!animate || reduceMotion) {
      breathe.setValue(0);
      float.setValue(0);
      tilt.setValue(0);
      return;
    }

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: energized ? 850 : 1650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: energized ? 850 : 1650,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const tiltLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
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
  }, [animate, reduceMotion, energized, breathe, float, tilt]);

  useEffect(() => {
    if (!animate || reduceMotion) {
      blink.setValue(1);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleBlink = () => {
      const delay = 2800 + Math.floor(Math.random() * 2400);
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.sequence([
          Animated.timing(blink, {
            toValue: 0.08,
            duration: 70,
            useNativeDriver: true,
          }),
          Animated.timing(blink, {
            toValue: 1,
            duration: 95,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished && !cancelled) scheduleBlink();
        });
      }, delay);
    };

    scheduleBlink();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      blink.stopAnimation();
      blink.setValue(1);
    };
  }, [animate, reduceMotion, blink]);

  const breatheScale = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [1, energized ? 1.04 : 1.02],
  });
  const glowOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.24, energized ? 0.78 : 0.52],
  });
  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1, -2],
  });
  const rotate = tilt.interpolate({
    inputRange: [0, 1],
    outputRange: ["-0.8deg", "0.8deg"],
  });

  const shellPadding = Math.max(8, Math.round(size * 0.12));
  const shellSize = size + shellPadding * 2;

  const avatar = (
    <View style={styles.row}>
      <View
        style={[
          styles.avatarShell,
          { width: shellSize, height: shellSize },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              left: shellPadding,
              top: shellPadding,
              opacity: glowOpacity,
              transform: [{ scale: breatheScale }],
            },
          ]}
        />

        <Animated.View
          style={{
            position: "absolute",
            left: shellPadding,
            top: shellPadding,
            width: size,
            height: size,
            transform: [
              { translateY },
              { rotate },
              { scale: Animated.multiply(breatheScale, press) },
            ],
          }}
        >
          <Animated.View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: "hidden",
              transform: [{ scaleY: blink }],
            }}
          >
            <Animated.Image
              source={CONSULTANT_IMAGE}
              resizeMode="cover"
              style={{ width: size, height: size, borderRadius: size / 2 }}
            />
          </Animated.View>

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
        </Animated.View>

        <View
          pointerEvents="none"
          style={[
            styles.liveDot,
            {
              right: shellPadding - 2,
              bottom: shellPadding - 2,
            },
          ]}
        />
      </View>

      {label ? (
        <View style={[styles.textWrap, compact && styles.textWrapCompact]}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>AI CONSULTANT</Text>
            <Text style={styles.stateText}>{STATE_LABELS[visualState]}</Text>
          </View>
          <Text style={styles.label}>{label}</Text>
          {!compact ? (
            <Text style={styles.subLabel}>
              Tap to talk with your ArtBoost marketing agent.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return avatar;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(press, {
          toValue: 0.95,
          friction: 6,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(press, {
          toValue: 1,
          friction: 5,
          useNativeDriver: true,
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={label ? `Open ${label}` : "Open AI Consultant"}
    >
      {avatar}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "visible",
  },
  avatarShell: {
    position: "relative",
    overflow: "visible",
    flexShrink: 0,
    zIndex: 2,
  },
  glow: {
    position: "absolute",
    backgroundColor: "#6d28d9",
    shadowColor: "#ff42c6",
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  lifeRing: {
    position: "absolute",
    top: 0,
    left: 0,
    borderWidth: 1.5,
    borderColor: "#65e8ff",
    shadowColor: "#ff42c6",
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  liveDot: {
    position: "absolute",
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#4dff9b",
    borderWidth: 2,
    borderColor: "#06120c",
    zIndex: 20,
    elevation: 20,
  },
  textWrap: { flex: 1, minWidth: 0 },
  textWrapCompact: { marginLeft: 0 },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  kicker: {
    color: "#b8a8ff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  stateText: {
    color: "#83f7ba",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  label: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  subLabel: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
});
