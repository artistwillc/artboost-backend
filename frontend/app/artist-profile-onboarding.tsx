// ARTBOOST_ARTIST_PROFILE_ONBOARDING_V2_20260928
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ImageBackground, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

type Answers = Record<string, string>;
type Question = readonly [string, string, string];

const REQUIRED: readonly Question[] = [
  ["discipline","What kind of artist are you?","Examples: tattoo artist, sculptor, painter, photographer, illustrator, ceramic artist, jewelry artist, woodworker, airbrush artist"],
  ["medium","What mediums, materials, or techniques do you primarily use?","Examples: black-and-gray tattooing, welded steel, acrylic, ceramics, photography, digital illustration"],
  ["offer","What do you sell or offer?","Examples: appointments, originals, commissions, handmade goods, prints, licensing"],
  ["style","How would you describe your style, specialty, or niche?","What do you most want to be known for?"],
  ["audience","Who is your ideal customer, client, collector, or buyer?","Describe the people or organizations you most want to reach."],
  ["channels","Where do you currently sell, book, exhibit, or find customers?","Examples: studio, fairs, galleries, website, Etsy, social media"],
  ["experience","What stage is your art business at?","Examples: starting out, part-time, established, full-time professional"],
  ["goal","What is your most important business goal right now?","Examples: more bookings, higher sales, gallery placement, wholesale growth"],
  ["marketing","What is your biggest marketing challenge?","Examples: visibility, content, pricing, conversion, finding the right audience"],
  ["location","What market do you primarily serve?","City/region for local artists, or online/national/international if applicable"],
];

const OPTIONAL: readonly Question[] = [
  ["priceRange","What is your typical price or service range?","Optional — approximate ranges are fine."],
  ["capacity","What is your typical monthly capacity or availability?","Optional — orders, appointments, commissions, pieces, or projects."],
  ["website","What is your website or primary portfolio?","Optional — website, shop, portfolio, or primary social profile."],
  ["brandVoice","How should your brand sound when speaking to customers?","Optional — examples: professional, bold, playful, luxury, educational, rugged."],
  ["bestSellers","What products, services, subjects, or styles perform best for you?","Optional — include anything customers repeatedly buy, book, or request."],
  ["salesCycle","How do customers usually discover you and complete a purchase or booking?","Optional — describe your typical path from discovery to sale."],
  ["promotion","What marketing or promotion has worked best for you so far?","Optional — social posts, events, referrals, email, ads, SEO, collaborations, etc."],
  ["competitors","Who do you consider comparable artists, shops, brands, or competitors?","Optional — names or a general description are both useful."],
  ["constraints","What business constraints should Merlin account for?","Optional — time, budget, production limits, shipping, geography, seasonality, or other limits."],
  ["notes","Anything else Merlin should know about your art business?","Optional — add context that would make your guidance more useful."],
];

const DRAFT_KEY = "artboost_artist_profile_draft";
const VERSION_KEY = "artboost_artist_profile_onboarding_version";

export default function ArtistProfileOnboarding() {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [optional, setOptional] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const item = optional ? OPTIONAL[step] : REQUIRED[step];
  const value = answers[item[0]] || "";
  const requiredComplete = useMemo(
    () => REQUIRED.every(([key]) => String(answers[key] || "").trim()),
    [answers]
  );
  const completedRequired = useMemo(
    () => REQUIRED.filter(([key]) => String(answers[key] || "").trim()).length,
    [answers]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error("Sign in again to continue your Artist Profile.");

        const completed = (user.user_metadata?.artboost_artist_profile || {}) as Answers;
        const draft = (user.user_metadata?.[DRAFT_KEY] || {}) as Answers;
        const restored: Answers = { ...completed, ...draft };

        if (!alive) return;
        setAnswers(restored);

        const firstMissingRequired = REQUIRED.findIndex(([key]) => !String(restored[key] || "").trim());
        if (firstMissingRequired >= 0) {
          setOptional(false);
          setStep(firstMissingRequired);
        } else {
          const firstMissingOptional = OPTIONAL.findIndex(([key]) => !String(restored[key] || "").trim());
          setOptional(true);
          setStep(firstMissingOptional >= 0 ? firstMissingOptional : 0);
        }
      } catch (e: any) {
        if (alive) Alert.alert("Artist Profile", e?.message || "Unable to restore your Artist Profile.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function persistDraft(nextAnswers: Answers) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Sign in again to save your Artist Profile.");
    const cleanDraft = Object.fromEntries(
      [...REQUIRED, ...OPTIONAL].map(([key]) => [key, String(nextAnswers[key] || "").trim()])
    );
    const { error } = await supabase.auth.updateUser({
      data: { ...(user.user_metadata || {}), [DRAFT_KEY]: cleanDraft }
    });
    if (error) throw error;
  }

  async function saveCurrentAnswer() {
    const trimmed = value.trim();
    if (!optional && !trimmed) {
      Alert.alert("Required question", "Please answer this question before continuing.");
      return null;
    }
    const nextAnswers = { ...answers, [item[0]]: trimmed };
    setAnswers(nextAnswers);
    setSaving(true);
    try {
      await persistDraft(nextAnswers);
      return nextAnswers;
    } catch (e: any) {
      Alert.alert("Artist Profile", e?.message || "Unable to save this answer. Please try again.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function finish(nextAnswers: Answers) {
    const complete = REQUIRED.every(([key]) => String(nextAnswers[key] || "").trim());
    if (!complete) {
      Alert.alert("Artist Profile", "Complete all 10 required questions before finishing.");
      setOptional(false);
      const missing = REQUIRED.findIndex(([key]) => !String(nextAnswers[key] || "").trim());
      setStep(Math.max(0, missing));
      return;
    }

    setSaving(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Sign in again to save your Artist Profile.");

      const existing = (user.user_metadata?.artboost_artist_profile || {}) as Record<string, any>;
      const profile: Record<string, any> = {
        ...existing,
        version: 2,
        completedAt: new Date().toISOString(),
      };
      [...REQUIRED, ...OPTIONAL].forEach(([key]) => {
        profile[key] = String(nextAnswers[key] || "").trim();
      });

      const nextMetadata = { ...(user.user_metadata || {}) } as Record<string, any>;
      delete nextMetadata[DRAFT_KEY];
      nextMetadata.artboost_artist_profile = profile;
      nextMetadata[VERSION_KEY] = 2;

      const { error } = await supabase.auth.updateUser({ data: nextMetadata });
      if (error) throw error;
      router.replace("/(tabs)/consultant" as any);
    } catch (e: any) {
      Alert.alert("Artist Profile", e?.message || "Unable to finish your Artist Profile.");
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (saving) return;
    const nextAnswers = await saveCurrentAnswer();
    if (!nextAnswers) return;

    if (!optional && step < REQUIRED.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!optional) {
      setOptional(true);
      setStep(0);
      return;
    }
    if (step < OPTIONAL.length - 1) {
      setStep(step + 1);
      return;
    }
    await finish(nextAnswers);
  }

  async function skip() {
    if (!optional || saving) return;
    const nextAnswers = { ...answers, [item[0]]: "" };
    setAnswers(nextAnswers);

    if (step === OPTIONAL.length - 1) {
      await finish(nextAnswers);
      return;
    }

    setSaving(true);
    try {
      await persistDraft(nextAnswers);
      setStep(step + 1);
    } catch (e: any) {
      Alert.alert("Artist Profile", e?.message || "Unable to save your progress. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const totalPosition = optional ? REQUIRED.length + step + 1 : step + 1;
  const totalQuestions = REQUIRED.length + OPTIONAL.length;
  const progressWidth = `${Math.round((totalPosition / totalQuestions) * 100)}%`;

  const isWeb = Platform.OS === "web";

  return (
    <SafeAreaView style={s.safe}>
      <ImageBackground
        source={isWeb ? require("../assets/images/artboost-cosmic-bg-v3153.png") : undefined}
        style={s.background}
        imageStyle={s.backgroundImage}
      >
        {isWeb ? <View pointerEvents="none" style={s.webScrim} /> : null}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.kicker}>ARTBOOST AI CONSULTANT</Text>
        <Text style={s.title}>Build Your Artist Profile</Text>
        <Text style={s.subtitle}>Merlin uses this profile to tailor marketing, pricing, content, sales, booking, and business guidance to your actual art practice. Your progress is saved after every answer.</Text>
        <View style={s.track}><View style={[s.fill, { width: progressWidth }]} /></View>
        <Text style={s.progress}>
          {loading
            ? "Restoring your saved progress..."
            : optional
              ? `Optional question ${step + 1} of ${OPTIONAL.length} • ${completedRequired}/10 required complete`
              : `Required question ${step + 1} of ${REQUIRED.length} • ${completedRequired}/10 complete`}
        </Text>
        <View style={s.card}>
          <Text style={s.question}>{item[1]}</Text>
          <Text style={s.hint}>{item[2]}</Text>
          <TextInput
            value={value}
            onChangeText={(text) => setAnswers((current) => ({ ...current, [item[0]]: text }))}
            placeholder="Type your answer..."
            placeholderTextColor="#77708d"
            multiline
            editable={!loading && !saving}
            autoFocus={Platform.OS !== "web" && !loading}
            style={s.input}
          />
        </View>
        <Pressable
          style={[s.primary, (loading || saving || (!optional && !value.trim())) && s.disabled]}
          onPress={next}
          disabled={loading || saving || (!optional && !value.trim())}
        >
          <Text style={s.primaryText}>
            {saving ? "Saving..." : optional && step === OPTIONAL.length - 1 ? "Save Artist Profile" : "Continue"}
          </Text>
        </Pressable>
        {optional ? (
          <Pressable style={s.secondary} onPress={skip} disabled={loading || saving}>
            <Text style={s.secondaryText}>{step === OPTIONAL.length - 1 ? "Finish without this answer" : "Skip optional question"}</Text>
          </Pressable>
        ) : null}
        <Text style={s.autosave}>Progress saves securely to your ArtBoost account after each step.</Text>
        </ScrollView>
      </ImageBackground>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#070611"},
  background:{flex:1},
  backgroundImage:{resizeMode:"cover"},
  webScrim:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(7, 6, 17, 0.66)"},
  content:{flexGrow:1,padding:24,paddingTop:36,maxWidth:720,width:"100%",alignSelf:"center"},
  kicker:{color:"#a78bfa",fontSize:13,fontWeight:"800",letterSpacing:1.6},
  title:{color:"#fff",fontSize:30,fontWeight:"800",marginTop:8},
  subtitle:{color:"#b9b0cc",fontSize:16,lineHeight:24,marginTop:10},
  track:{height:8,borderRadius:8,backgroundColor:"#242035",overflow:"hidden",marginTop:28},
  fill:{height:8,backgroundColor:"#7c3aed"},
  progress:{color:"#c4b5fd",fontSize:14,fontWeight:"700",marginTop:9},
  card:{backgroundColor:"#12101d",borderWidth:1,borderColor:"#33295a",borderRadius:22,padding:20,marginTop:24},
  question:{color:"#fff",fontSize:22,fontWeight:"700",lineHeight:30},
  hint:{color:"#a9a1ba",fontSize:14,lineHeight:20,marginTop:8},
  input:{minHeight:120,borderWidth:1,borderColor:"#4b3b79",borderRadius:16,color:"#fff",fontSize:17,lineHeight:24,padding:16,marginTop:18,textAlignVertical:"top",backgroundColor:"#0b0a13"},
  primary:{backgroundColor:"#7c3aed",borderRadius:16,paddingVertical:16,alignItems:"center",marginTop:22},
  disabled:{opacity:.5},
  primaryText:{color:"#fff",fontSize:17,fontWeight:"800"},
  secondary:{paddingVertical:15,alignItems:"center"},
  secondaryText:{color:"#b9b0cc",fontSize:15,fontWeight:"600"},
  autosave:{color:"#77708d",textAlign:"center",fontSize:12,marginTop:6,marginBottom:16},
});
