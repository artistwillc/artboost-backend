// ARTBOOST_WEB_AUTH_V1_20260929
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "@/lib/supabase";

type Mode = "signup" | "signin";

export default function WebAuthScreen() {
  const params = useLocalSearchParams<{ mode?: string; tier?: string }>();
  const requestedMode: Mode = params.mode === "signin" ? "signin" : "signup";
  const requestedTier = ["starter", "pro", "business"].includes(String(params.tier || "").toLowerCase())
    ? String(params.tier).toLowerCase()
    : "";
  const dashboardRoute = requestedTier ? `/web-dashboard?tier=${encodeURIComponent(requestedTier)}` : "/web-dashboard";
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session?.user) {
        router.replace(dashboardRoute as any);
        return;
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  async function submit() {
    setMessage("");
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setMessage("Enter your email and password.");
      return;
    }
    if (mode === "signup" && !legalAccepted) {
      setMessage("Accept the Terms of Service and acknowledge the Privacy Policy before creating an account.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const acceptedAt = new Date().toISOString();
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: {
            artboost_terms_accepted_at: acceptedAt,
            artboost_privacy_acknowledged_at: acceptedAt,
            artboost_legal_version: "2026-08-31",
          } },
        });
        if (error) throw error;
        if (data.session?.user) {
          router.replace((requestedTier ? `/artist-profile-onboarding?tier=${encodeURIComponent(requestedTier)}` : "/artist-profile-onboarding") as any);
          return;
        }
        setMessage("Account created. Check your email to confirm your address, then return here and sign in.");
        setMode("signin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      router.replace(dashboardRoute as any);
    } catch (error: any) {
      setMessage(error?.message || "ArtBoost could not complete authentication.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <SafeAreaView style={s.safe}><View style={s.loading}><ActivityIndicator size="large" /><Text style={s.muted}>Opening ArtBoost...</Text></View></SafeAreaView>;
  }

  const signup = mode === "signup";
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.shell}>
        <Text style={s.kicker}>ARTBOOST AI</Text>
        <Text style={s.title}>{signup ? "Create your account" : "Welcome back"}</Text>
        <Text style={s.subtitle}>{signup ? "Create one ArtBoost account for web, iPhone, and Android." : "Sign in to continue to your ArtBoost workspace."}</Text>

        <View style={s.tabs}>
          <Pressable style={[s.tab, signup && s.tabActive]} onPress={() => { setMode("signup"); setMessage(""); }}><Text style={[s.tabText, signup && s.tabTextActive]}>Create Account</Text></Pressable>
          <Pressable style={[s.tab, !signup && s.tabActive]} onPress={() => { setMode("signin"); setMessage(""); }}><Text style={[s.tabText, !signup && s.tabTextActive]}>Log In</Text></Pressable>
        </View>

        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#77708d" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={s.input} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor="#77708d" secureTextEntry autoCapitalize="none" style={s.input} />

        {signup ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: legalAccepted }} style={s.consent} onPress={() => setLegalAccepted(v => !v)}>
          <View style={[s.checkbox, legalAccepted && s.checkboxChecked]}><Text style={s.check}>{legalAccepted ? "✓" : ""}</Text></View>
          <Text style={s.consentText}>I agree to the ArtBoost Terms of Service and acknowledge the Privacy Policy.</Text>
        </Pressable> : null}

        {signup ? <View style={s.legalLinks}>
          <Pressable onPress={() => Linking.openURL("https://artboostai.com/terms")}><Text style={s.link}>Terms of Service</Text></Pressable>
          <Text style={s.muted}>•</Text>
          <Pressable onPress={() => Linking.openURL("https://artboostai.com/privacy")}><Text style={s.link}>Privacy Policy</Text></Pressable>
        </View> : null}

        {message ? <Text style={s.message}>{message}</Text> : null}
        <Pressable style={[s.primary, (submitting || (signup && !legalAccepted)) && s.disabled]} disabled={submitting || (signup && !legalAccepted)} onPress={submit}>
          <Text style={s.primaryText}>{submitting ? "Please wait..." : signup ? "Create Account" : "Log In"}</Text>
        </Pressable>
        <Text style={s.security}>Your ArtBoost session is stored securely in this browser.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#070611"},loading:{flex:1,alignItems:"center",justifyContent:"center",gap:14},
  shell:{flex:1,width:"100%",maxWidth:560,alignSelf:"center",justifyContent:"center",padding:28},
  kicker:{color:"#f7b733",fontSize:13,fontWeight:"900",letterSpacing:2},title:{color:"#fff",fontSize:36,fontWeight:"900",marginTop:10},
  subtitle:{color:"#b9b0cc",fontSize:16,lineHeight:24,marginTop:10,marginBottom:24},tabs:{flexDirection:"row",backgroundColor:"#0d0b16",borderRadius:14,padding:4,marginBottom:18},
  tab:{flex:1,paddingVertical:12,alignItems:"center",borderRadius:11},tabActive:{backgroundColor:"#24183b"},tabText:{color:"#9b94a9",fontWeight:"800"},tabTextActive:{color:"#fff"},
  input:{backgroundColor:"#12101d",borderColor:"#3c315f",borderWidth:1,borderRadius:14,color:"#fff",fontSize:16,paddingHorizontal:16,paddingVertical:15,marginBottom:12},
  consent:{flexDirection:"row",alignItems:"flex-start",gap:12,marginTop:5},checkbox:{width:24,height:24,borderRadius:6,borderWidth:1,borderColor:"#6f5aa5",alignItems:"center",justifyContent:"center",flexShrink:0},
  checkboxChecked:{backgroundColor:"#7c3aed",borderColor:"#a78bfa"},check:{color:"#fff",fontWeight:"900"},consentText:{color:"#d3cde0",flex:1,lineHeight:21},
  legalLinks:{flexDirection:"row",gap:10,alignItems:"center",marginTop:10},link:{color:"#c4b5fd",fontWeight:"800"},message:{color:"#f6c968",lineHeight:20,marginTop:14},
  primary:{backgroundColor:"#7c3aed",borderRadius:14,paddingVertical:16,alignItems:"center",marginTop:20},disabled:{opacity:.5},primaryText:{color:"#fff",fontSize:17,fontWeight:"900"},
  muted:{color:"#8d849e"},security:{color:"#77708d",textAlign:"center",fontSize:12,marginTop:14},
});
