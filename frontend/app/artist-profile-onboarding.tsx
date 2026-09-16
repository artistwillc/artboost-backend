// ARTBOOST_ARTIST_PROFILE_ONBOARDING_V1_20260916
import React, { useMemo, useState } from "react";
import { Alert, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
type Answers=Record<string,string>;
const REQUIRED=[
["discipline","What kind of artist are you?","Examples: tattoo artist, sculptor, painter, photographer, craft artist"],
["medium","What mediums, materials, or techniques do you primarily use?","Examples: black-and-gray tattooing, welded steel, acrylic, ceramics"],
["offer","What do you sell or offer?","Examples: appointments, originals, commissions, handmade goods, prints, licensing"],
["style","How would you describe your style, specialty, or niche?","What do you most want to be known for?"],
["audience","Who is your ideal customer, client, collector, or buyer?","Describe the people or organizations you most want to reach."],
["channels","Where do you currently sell, book, exhibit, or find customers?","Examples: studio, fairs, galleries, website, Etsy, social media"],
["experience","What stage is your art business at?","Examples: starting out, part-time, established, full-time professional"],
["goal","What is your most important business goal right now?","Examples: more bookings, higher sales, gallery placement, wholesale growth"],
["marketing","What is your biggest marketing challenge?","Examples: visibility, content, pricing, conversion, finding the right audience"],
["location","What market do you primarily serve?","City/region for local artists, or online/national/international if applicable"],
] as const;
const OPTIONAL=[
["priceRange","Typical price or service range","Optional"],
["capacity","Typical monthly capacity or availability","Optional"],
["website","Website or primary portfolio","Optional"],
["notes","Anything else Merlin should know about your art business","Optional"],
] as const;
export default function ArtistProfileOnboarding(){
 const [answers,setAnswers]=useState<Answers>({}); const [step,setStep]=useState(0); const [optional,setOptional]=useState(false); const [saving,setSaving]=useState(false);
 const item=optional?OPTIONAL[step]:REQUIRED[step]; const value=answers[item[0]]||"";
 const requiredComplete=useMemo(()=>REQUIRED.every(([k])=>String(answers[k]||"").trim()),[answers]);
 async function save(){
  if(!requiredComplete||saving)return; setSaving(true);
  try{
   const {data:{user},error:userError}=await supabase.auth.getUser(); if(userError||!user)throw new Error("Sign in again to save your Artist Profile.");
   const profile={version:1,completedAt:new Date().toISOString(),discipline:answers.discipline.trim(),medium:answers.medium.trim(),offer:answers.offer.trim(),style:answers.style.trim(),audience:answers.audience.trim(),channels:answers.channels.trim(),experience:answers.experience.trim(),goal:answers.goal.trim(),marketing:answers.marketing.trim(),location:answers.location.trim(),priceRange:String(answers.priceRange||"").trim(),capacity:String(answers.capacity||"").trim(),website:String(answers.website||"").trim(),notes:String(answers.notes||"").trim()};
   const {error}=await supabase.auth.updateUser({data:{...(user.user_metadata||{}),artboost_artist_profile:profile,artboost_artist_profile_onboarding_version:1}}); if(error)throw error;
   router.replace("/(tabs)/consultant" as any);
  }catch(e:any){Alert.alert("Artist Profile",e?.message||"Unable to save your Artist Profile.");}finally{setSaving(false);}
 }
 function next(){
  if(!optional&&!value.trim()){Alert.alert("Required question","Please answer this question before continuing.");return;}
  setAnswers(v=>({...v,[item[0]]:value.trim()}));
  if(!optional&&step<REQUIRED.length-1){setStep(step+1);return;}
  if(!optional){setOptional(true);setStep(0);return;}
  if(step<OPTIONAL.length-1){setStep(step+1);return;} save();
 }
 function skip(){if(step<OPTIONAL.length-1)setStep(step+1);else save();}
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
  <Text style={s.kicker}>ARTBOOST AI CONSULTANT</Text><Text style={s.title}>Build Your Artist Profile</Text>
  <Text style={s.subtitle}>Merlin uses this profile to tailor marketing, pricing, content, sales, booking, and business guidance to your actual art practice.</Text>
  <View style={s.track}><View style={[s.fill,{width:`${optional?100:((step+1)/REQUIRED.length)*100}%`}]} /></View>
  <Text style={s.progress}>{optional?`Optional enrichment ${step+1} of ${OPTIONAL.length}`:`${step+1} of ${REQUIRED.length} required`}</Text>
  <View style={s.card}><Text style={s.question}>{item[1]}</Text><Text style={s.hint}>{item[2]}</Text>
   <TextInput value={value} onChangeText={t=>setAnswers(v=>({...v,[item[0]]:t}))} placeholder="Type your answer..." placeholderTextColor="#77708d" multiline autoFocus={Platform.OS!=="web"} style={s.input}/>
  </View>
  <Pressable style={[s.primary,(!optional&&!value.trim())&&s.disabled]} onPress={next}><Text style={s.primaryText}>{optional&&step===OPTIONAL.length-1?"Save Artist Profile":"Continue"}</Text></Pressable>
  {optional?<Pressable style={s.secondary} onPress={skip}><Text style={s.secondaryText}>{step===OPTIONAL.length-1?"Finish without this answer":"Skip optional question"}</Text></Pressable>:null}
  {saving?<Text style={s.saving}>Saving your Artist Profile...</Text>:null}
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#070611"},content:{flexGrow:1,padding:24,paddingTop:36,maxWidth:720,width:"100%",alignSelf:"center"},kicker:{color:"#a78bfa",fontSize:13,fontWeight:"800",letterSpacing:1.6},title:{color:"#fff",fontSize:30,fontWeight:"800",marginTop:8},subtitle:{color:"#b9b0cc",fontSize:16,lineHeight:24,marginTop:10},track:{height:8,borderRadius:8,backgroundColor:"#242035",overflow:"hidden",marginTop:28},fill:{height:8,backgroundColor:"#7c3aed"},progress:{color:"#c4b5fd",fontSize:14,fontWeight:"700",marginTop:9},card:{backgroundColor:"#12101d",borderWidth:1,borderColor:"#33295a",borderRadius:22,padding:20,marginTop:24},question:{color:"#fff",fontSize:22,fontWeight:"700",lineHeight:30},hint:{color:"#a9a1ba",fontSize:14,lineHeight:20,marginTop:8},input:{minHeight:120,borderWidth:1,borderColor:"#4b3b79",borderRadius:16,color:"#fff",fontSize:17,lineHeight:24,padding:16,marginTop:18,textAlignVertical:"top",backgroundColor:"#0b0a13"},primary:{backgroundColor:"#7c3aed",borderRadius:16,paddingVertical:16,alignItems:"center",marginTop:22},disabled:{opacity:.5},primaryText:{color:"#fff",fontSize:17,fontWeight:"800"},secondary:{paddingVertical:15,alignItems:"center"},secondaryText:{color:"#b9b0cc",fontSize:15,fontWeight:"600"},saving:{color:"#86efac",textAlign:"center",marginTop:10}});
