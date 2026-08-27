import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Screen() {
  const params = useLocalSearchParams<{ storeId?: string; storeName?: string; storeType?: string }>();
  const storeName = params.storeName || "Connected Store";

  function openPrimary() {
    router.push({
      pathname: "/store-automation" as any,
      params: {
        storeId: params.storeId || "",
        storeName,
        storeType: params.storeType || "store",
      },
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/store-dashboard" as any); }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>STORE ORGANIZATION</Text>
          <Text style={styles.title}>Collections</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.storeCard}>
          <Ionicons name="folder-open-outline" size={26} color="#c4b5fd" />
          <View style={{flex:1}}>
            <Text style={styles.storeLabel}>SELECTED STORE</Text>
            <Text style={styles.storeName}>{storeName}</Text>
          </View>
          <View style={styles.businessPill}><Text style={styles.businessText}>BUSINESS</Text></View>
        </View>
        <View style={styles.card}><Text style={styles.cardTitle}>Campaign Collections</Text><Text style={styles.cardText}>Use the selected store as the source for grouped promotion workflows. Open Grow My Business to choose products and build the campaign schedule without changing the underlying store catalog.</Text></View><View style={styles.card}><Text style={styles.cardTitle}>Catalog-safe organization</Text><Text style={styles.cardText}>ArtBoost keeps imported products attached to their original store. Collection workflows organize promotion activity; they do not rewrite the merchant catalog.</Text></View>
        <Pressable style={styles.primary} onPress={openPrimary}>
          <Text style={styles.primaryText}>Open Grow My Business</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:"#0b0b0b"},
  header:{paddingHorizontal:20,paddingVertical:14,flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderBottomColor:"#252525"},
  back:{width:44,height:44,borderRadius:15,backgroundColor:"#171717",alignItems:"center",justifyContent:"center"},
  headerText:{marginLeft:14},
  eyebrow:{color:"#a78bfa",fontSize:10,fontWeight:"900",letterSpacing:1.3},
  title:{color:"#fff",fontSize:24,fontWeight:"900",marginTop:2},
  content:{padding:20,paddingBottom:50},
  storeCard:{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderRadius:18,backgroundColor:"#151515",borderWidth:1,borderColor:"#292929",marginBottom:18},
  storeLabel:{color:"#777",fontSize:10,fontWeight:"900",letterSpacing:1},
  storeName:{color:"#fff",fontSize:17,fontWeight:"800",marginTop:3},
  businessPill:{paddingHorizontal:9,paddingVertical:5,borderRadius:20,backgroundColor:"#30204b"},
  businessText:{color:"#d8b4fe",fontSize:9,fontWeight:"900"},
  card:{padding:18,borderRadius:18,backgroundColor:"#141414",borderWidth:1,borderColor:"#292929",marginBottom:12},
  cardTitle:{color:"#fff",fontSize:17,fontWeight:"900",marginBottom:7},
  cardText:{color:"#aaa",fontSize:14,lineHeight:21},
  primary:{marginTop:8,minHeight:54,borderRadius:17,backgroundColor:"#7c3aed",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,paddingHorizontal:18},
  primaryText:{color:"#fff",fontSize:15,fontWeight:"900"},
});
