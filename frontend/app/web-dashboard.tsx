// ARTBOOST_WEB_DASHBOARD_V1_20260929
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { supabase } from "@/lib/supabase";

const actions = [
  { title: "Artwork Library", copy: "Review imported artwork and products from your connected stores.", route: "/(tabs)/products" },
  { title: "Connect", copy: "Manage stores and social platform connections.", route: "/(tabs)/connections" },
  { title: "AI Consultant", copy: "Ask ArtBoost what to market next and build your next campaign.", route: "/(tabs)/consultant" },
  { title: "Campaign Manager", copy: "Create, schedule, and manage your marketing campaigns.", route: "/campaign-manager" },
  { title: "Video Studio", copy: "Turn artwork into social-ready vertical video.", route: "/video-studio" },
  { title: "Publishing History", copy: "Review recent campaign and publishing activity.", route: "/history" },
];

export default function WebDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("Starter");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!alive) return;
      if (!user) {
        router.replace("/web-auth" as any);
        return;
      }
      setEmail(user.email || "");
      const { data: profile } = await supabase.from("profiles").select("subscription_tier").eq("id", user.id).maybeSingle();
      if (!alive) return;
      const raw = String(profile?.subscription_tier || "starter").toLowerCase();
      setTier(raw === "business" ? "Business" : raw === "pro" ? "Pro" : "Starter");
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/web-auth" as any);
  }

  if (loading) return <SafeAreaView style={s.safe}><View style={s.loading}><ActivityIndicator size="large" /><Text style={s.muted}>Opening your ArtBoost workspace...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={[s.nav, compact && s.navCompact]}>
          <View><Text style={s.brand}>ARTBOOST AI</Text><Text style={s.brandSub}>CREATOR MARKETING WORKSPACE</Text></View>
          <View style={s.navActions}><Pressable onPress={() => router.push("/(tabs)/consultant" as any)}><Text style={s.navLink}>AI Consultant</Text></Pressable><Pressable onPress={signOut}><Text style={s.signOut}>Sign Out</Text></Pressable></View>
        </View>

        <View style={[s.hero, compact && s.heroCompact]}>
          <View style={s.heroCopy}>
            <Text style={s.eyebrow}>YOUR ART. YOUR BUSINESS. AMPLIFIED.</Text>
            <Text style={[s.title, compact && s.titleCompact]}>Your ArtBoost command center</Text>
            <Text style={s.subtitle}>Connect your creative business, build campaigns with AI, and publish from one workspace.</Text>
            <View style={s.heroButtons}>
              <Pressable style={s.goldButton} onPress={() => router.push("/(tabs)/consultant" as any)}><Text style={s.goldText}>Ask AI Consultant</Text></Pressable>
              <Pressable style={s.outlineButton} onPress={() => router.push("/campaign-manager" as any)}><Text style={s.outlineText}>Open Campaign Manager</Text></Pressable>
            </View>
          </View>
          <View style={s.accountCard}><Text style={s.cardLabel}>SIGNED IN</Text><Text style={s.email} numberOfLines={1}>{email}</Text><View style={s.tierPill}><Text style={s.tierText}>{tier.toUpperCase()}</Text></View><Text style={s.accountCopy}>One account across ArtBoost web, iPhone, and Android.</Text></View>
        </View>

        <View style={s.sectionHead}><Text style={s.sectionKicker}>ARTBOOST WORKSPACE</Text><Text style={s.sectionTitle}>Everything you need to market your work</Text></View>
        <View style={s.grid}>
          {actions.map((item) => <Pressable key={item.title} style={[s.actionCard, compact && s.actionCardCompact]} onPress={() => router.push(item.route as any)}>
            <Text style={s.actionTitle}>{item.title}</Text><Text style={s.actionCopy}>{item.copy}</Text><Text style={s.open}>OPEN  →</Text>
          </Pressable>)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#07060d"},page:{minHeight:"100%",paddingBottom:64},
  loading:{flex:1,alignItems:"center",justifyContent:"center",gap:14},muted:{color:"#9c93ac"},
  nav:{width:"100%",maxWidth:1180,alignSelf:"center",paddingHorizontal:30,paddingVertical:24,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},navCompact:{paddingHorizontal:20},
  brand:{color:"#f6c84b",fontSize:20,fontWeight:"900",letterSpacing:3},brandSub:{color:"#8f849f",fontSize:9,fontWeight:"800",letterSpacing:2,marginTop:4},
  navActions:{flexDirection:"row",alignItems:"center",gap:20},navLink:{color:"#e9e3f2",fontWeight:"800"},signOut:{color:"#f6c84b",fontWeight:"900"},
  hero:{width:"100%",maxWidth:1180,alignSelf:"center",borderWidth:1,borderColor:"#4a2d75",borderRadius:28,backgroundColor:"#100b1c",padding:42,flexDirection:"row",gap:36,alignItems:"center"},heroCompact:{marginHorizontal:16,width:"auto",padding:24,flexDirection:"column",alignItems:"stretch"},
  heroCopy:{flex:1},eyebrow:{color:"#f6c84b",fontSize:12,fontWeight:"900",letterSpacing:2.4},title:{color:"#fff",fontSize:52,lineHeight:58,fontWeight:"900",marginTop:12},titleCompact:{fontSize:36,lineHeight:41},
  subtitle:{color:"#c6bed0",fontSize:18,lineHeight:28,maxWidth:680,marginTop:16},heroButtons:{flexDirection:"row",flexWrap:"wrap",gap:12,marginTop:26},
  goldButton:{backgroundColor:"#f3bf35",borderRadius:12,paddingHorizontal:22,paddingVertical:14},goldText:{color:"#17100a",fontWeight:"900"},outlineButton:{borderWidth:1,borderColor:"#7651ad",borderRadius:12,paddingHorizontal:22,paddingVertical:14},outlineText:{color:"#fff",fontWeight:"900"},
  accountCard:{width:310,maxWidth:"100%",borderWidth:1,borderColor:"#60418b",backgroundColor:"#0a0811",borderRadius:20,padding:22},cardLabel:{color:"#9e72e8",fontSize:11,fontWeight:"900",letterSpacing:2},email:{color:"#fff",fontSize:18,fontWeight:"800",marginTop:8},
  tierPill:{alignSelf:"flex-start",backgroundColor:"#6d35c7",borderRadius:99,paddingHorizontal:14,paddingVertical:7,marginTop:16},tierText:{color:"#fff",fontSize:11,fontWeight:"900",letterSpacing:1},accountCopy:{color:"#9e96a9",lineHeight:20,marginTop:16},
  sectionHead:{width:"100%",maxWidth:1180,alignSelf:"center",paddingHorizontal:30,marginTop:46,marginBottom:18},sectionKicker:{color:"#9e72e8",fontSize:11,fontWeight:"900",letterSpacing:2},sectionTitle:{color:"#fff",fontSize:30,fontWeight:"900",marginTop:7},
  grid:{width:"100%",maxWidth:1180,alignSelf:"center",paddingHorizontal:30,flexDirection:"row",flexWrap:"wrap",gap:16},actionCard:{width:"31.8%",minWidth:260,borderWidth:1,borderColor:"#332342",backgroundColor:"#0e0b15",borderRadius:18,padding:22},actionCardCompact:{width:"100%"},
  actionTitle:{color:"#fff",fontSize:19,fontWeight:"900"},actionCopy:{color:"#a9a0b4",lineHeight:21,marginTop:9,minHeight:44},open:{color:"#f6c84b",fontSize:11,fontWeight:"900",letterSpacing:1.5,marginTop:20},
});
