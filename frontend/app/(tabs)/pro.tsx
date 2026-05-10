import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function ProScreen() {
  const handleUpgrade = () => {
    Alert.alert(
      "ArtBoost Pro",
      "Subscriptions will be connected later with Stripe, RevenueCat, or app store purchases."
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>ArtBoost Pro</Text>

      <Text style={styles.subheader}>
        Unlock automation, scheduling, analytics, and direct social posting.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Free Plan</Text>

        <Text style={styles.feature}>✓ Generate AI marketing campaigns</Text>
        <Text style={styles.feature}>✓ Upload artwork</Text>
        <Text style={styles.feature}>✓ Copy platform captions</Text>
        <Text style={styles.feature}>✓ Save campaign history</Text>
        <Text style={styles.feature}>✓ Product/shop link support</Text>
      </View>

      <View style={styles.proCard}>
        <Text style={styles.proTitle}>Pro Plan</Text>
        <Text style={styles.price}>$14.99 / month</Text>

        <Text style={styles.proFeature}>✓ Auto-post to connected platforms</Text>
        <Text style={styles.proFeature}>✓ Weekly/monthly repost scheduling</Text>
        <Text style={styles.proFeature}>✓ Pinterest automation</Text>
        <Text style={styles.proFeature}>✓ Instagram/Facebook automation</Text>
        <Text style={styles.proFeature}>✓ Performance analytics</Text>
        <Text style={styles.proFeature}>✓ Best hashtag tracking</Text>
        <Text style={styles.proFeature}>✓ Saved product/link templates</Text>
        <Text style={styles.proFeature}>✓ Priority AI generation</Text>

        <Pressable style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeText}>Upgrade to Pro</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coming Soon</Text>

        <Text style={styles.feature}>• Real Pinterest posting</Text>
        <Text style={styles.feature}>• Social account OAuth login</Text>
        <Text style={styles.feature}>• Auto-repost campaigns</Text>
        <Text style={styles.feature}>• Analytics dashboard</Text>
        <Text style={styles.feature}>• Multi-device cloud sync</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#101010",
    minHeight: "100%",
  },
  header: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    marginTop: 40,
    textAlign: "center",
  },
  subheader: {
    color: "#aaa",
    fontSize: 15,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#1b1b1b",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  proCard: {
    backgroundColor: "#25164a",
    borderRadius: 18,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#8b5cf6",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 14,
  },
  proTitle: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    marginBottom: 6,
  },
  price: {
    color: "#facc15",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 18,
  },
  feature: {
    color: "#ddd",
    fontSize: 15,
    marginBottom: 10,
    lineHeight: 21,
  },
  proFeature: {
    color: "#fff",
    fontSize: 15,
    marginBottom: 10,
    lineHeight: 21,
  },
  upgradeButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 18,
  },
  upgradeText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
});