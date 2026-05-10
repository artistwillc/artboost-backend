import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function BrandScreen() {
  const [brandName, setBrandName] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [defaultCTA, setDefaultCTA] = useState("");
  const [defaultHashtags, setDefaultHashtags] = useState("");
  const [avoidWords, setAvoidWords] = useState("");

  const loadBrand = async () => {
    const saved = await AsyncStorage.getItem("artboost_brand_profile");

    if (!saved) return;

    const profile = JSON.parse(saved);

    setBrandName(profile.brandName || "");
    setBrandVoice(profile.brandVoice || "");
    setTargetAudience(profile.targetAudience || "");
    setDefaultCTA(profile.defaultCTA || "");
    setDefaultHashtags(profile.defaultHashtags || "");
    setAvoidWords(profile.avoidWords || "");
  };

  const saveBrand = async () => {
    const profile = {
      brandName,
      brandVoice,
      targetAudience,
      defaultCTA,
      defaultHashtags,
      avoidWords,
      updatedAt: new Date().toLocaleString(),
    };

    await AsyncStorage.setItem("artboost_brand_profile", JSON.stringify(profile));

    Alert.alert("Saved", "Brand profile saved successfully.");
  };

  const clearBrand = async () => {
    await AsyncStorage.removeItem("artboost_brand_profile");

    setBrandName("");
    setBrandVoice("");
    setTargetAudience("");
    setDefaultCTA("");
    setDefaultHashtags("");
    setAvoidWords("");

    Alert.alert("Cleared", "Brand profile cleared.");
  };

  useEffect(() => {
    loadBrand();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Brand Voice</Text>

      <Text style={styles.subheader}>
        Save your default brand style so ArtBoost can generate more consistent campaigns.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Brand / Artist Name</Text>
        <TextInput
          style={styles.input}
          value={brandName}
          onChangeText={setBrandName}
          placeholder="ArtistWill, Will’s Custom Airbrushing, etc."
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Brand Voice</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={brandVoice}
          onChangeText={setBrandVoice}
          placeholder="Bold, rugged, professional, blue-collar, premium, funny, etc."
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Target Audience</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={targetAudience}
          onChangeText={setTargetAudience}
          placeholder="Artists, linemen, duck hunters, first responders, sticker buyers, POD shoppers..."
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Default CTA</Text>
        <TextInput
          style={styles.input}
          value={defaultCTA}
          onChangeText={setDefaultCTA}
          placeholder="Shop this design here:"
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Default Hashtags</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={defaultHashtags}
          onChangeText={setDefaultHashtags}
          placeholder="#artistwill #customart #printondemand"
          placeholderTextColor="#777"
        />

        <Text style={styles.label}>Words / Phrases to Avoid</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          value={avoidWords}
          onChangeText={setAvoidWords}
          placeholder="Avoid overly generic terms, copyrighted names, etc."
          placeholderTextColor="#777"
        />
      </View>

      <Pressable style={styles.saveButton} onPress={saveBrand}>
        <Text style={styles.buttonText}>Save Brand Profile</Text>
      </Pressable>

      <Pressable style={styles.clearButton} onPress={clearBrand}>
        <Text style={styles.buttonText}>Clear Brand Profile</Text>
      </Pressable>
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

  label: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 12,
  },

  input: {
    backgroundColor: "#2b2b2b",
    color: "#fff",
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
  },

  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  saveButton: {
    backgroundColor: "#8b5cf6",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 12,
  },

  clearButton: {
    backgroundColor: "#444",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginBottom: 40,
  },

  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});