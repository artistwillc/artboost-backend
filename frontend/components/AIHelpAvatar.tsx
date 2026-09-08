import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";

const HELP_IMAGE = require("../assets/images/artboost-ai-help.jpg");

export type AIHelpVisualState =
  | "idle"
  | "focused"
  | "listening"
  | "thinking"
  | "working"
  | "responseReady"
  | "complete";

type Props = {
  size?: number;
  active?: boolean;
  state?: AIHelpVisualState;
  animate?: boolean;
};

export default function AIHelpAvatar({
  size = 44,
  active = false,
  state,
  animate = true,
}: Props) {
  const visualState: AIHelpVisualState =
    state || (active ? "working" : "idle");
  const energized = visualState !== "idle";
  const [reduceMotion, setReduceMotion] = useState(false);

  const breathe = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;

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
      sway.setValue(0);
      return;
    }

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: energized ? 900 : 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: energized ? 900 : 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const swayLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    breatheLoop.start();
    floatLoop.start();
    swayLoop.start();

    return () => {
      breatheLoop.stop();
      floatLoop.stop();
      swayLoop.stop();
    };
  }, [animate, reduceMotion, energized, breathe, float, sway]);

  useEffect(() => {
    if (!animate || reduceMotion) {
      blink.setValue(1);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleBlink = () => {
      const delay = 3000 + Math.floor(Math.random() * 2200);

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
    outputRange: [1, energized ? 1.05 : 1.025],
  });
  const glowOpacity = breathe.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, energized ? 0.82 : 0.6],
  });
  const translateY = float.interpolate({
    inputRange: [0, 1],
    outputRange: [1.5, -2.5],
  });
  const rotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ["-1deg", "1deg"],
  });

  const shellPadding = Math.max(5, Math.round(size * 0.14));
  const shellSize = size + shellPadding * 2;
  const liveDotSize = Math.max(10, Math.round(size * 0.24));

  return (
    <View
      style={[
        styles.shell,
        {
          width: shellSize,
          height: shellSize,
        },
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
            { scale: breatheScale },
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
            source={HELP_IMAGE}
            resizeMode="cover"
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
            }}
          />
        </Animated.View>

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
      </Animated.View>

      <View
        pointerEvents="none"
        style={[
          styles.liveDot,
          {
            width: liveDotSize,
            height: liveDotSize,
            borderRadius: liveDotSize / 2,
            right: shellPadding - 2,
            bottom: shellPadding - 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "relative",
    overflow: "visible",
    flexShrink: 0,
    zIndex: 2,
  },
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
  liveDot: {
    position: "absolute",
    backgroundColor: "#4dff9b",
    borderWidth: 2,
    borderColor: "#06120c",
    zIndex: 20,
    elevation: 20,
  },
});
