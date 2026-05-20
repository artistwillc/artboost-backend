import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BACKEND_URL = "https://artboost-ai.onrender.com";

type AnalyticsData = {
  total: number;
  scheduled: number;
  published: number;
  failed: number;
  saved: number;
  active: number;
  paused: number;
  unread: number;
  successRate: number;
  pinterestConnected: boolean;
  upcoming: any | null;
};

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] =
    useState<AnalyticsData | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState("");

  async function loadAnalytics() {
    try {

      setError("");

      const response =
        await fetch(
          `${BACKEND_URL}/scheduled-campaigns`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Failed to load analytics."
        );
      }

      const campaigns =
        data.campaigns || [];

      const publishedCount =
        campaigns.filter(
          (c:any)=>
            c.status==="published"
        ).length;

      const failedCount =
        campaigns.filter(
          (c:any)=>
            c.status==="failed"
        ).length;

      const analyticsData:any = {

        total:
          campaigns.length,

        scheduled:
          campaigns.filter(
            (c:any)=>
              c.status==="scheduled"
          ).length,

        published:
          publishedCount,

        failed:
          failedCount,

        successRate:
          publishedCount +
          failedCount > 0

          ? Math.round(
              (
                publishedCount /
                (
                  publishedCount +
                  failedCount
                )
              ) * 100
            )

          : 0,

        saved:
          campaigns.filter(
            (c:any)=>
              c.status==="saved"
          ).length,

        active:
          campaigns.filter(
            (c:any)=>
              c.campaignStatus==="active"
          ).length,

        paused:
          campaigns.filter(
            (c:any)=>
              c.campaignStatus==="paused"
          ).length,

        upcoming:

          campaigns

          .filter(
            (c:any)=>
              c.publishAt
          )

          .sort(
            (a:any,b:any)=>

              new Date(
                a.publishAt
              ).getTime()

              -

              new Date(
                b.publishAt
              ).getTime()
          )[0]

          || null,

      };

      const notificationsRes =
        await fetch(
          `${BACKEND_URL}/notifications/all`
        );

      const notificationsData =
        await notificationsRes.json();

      const pinterestRes =
        await fetch(
          `${BACKEND_URL}/pinterest/status`
        );

      const pinterestData =
        await pinterestRes.json();

      analyticsData.unread =
        notificationsData
          .notifications
          ?.filter(
            (n:any)=>
              n.unread
          ).length || 0;

      analyticsData
        .pinterestConnected =

        pinterestData
          .connected || false;

      setAnalytics(
        analyticsData
      );

    } catch(err:any){

      setError(
        err.message ||
        "Something went wrong."
      );

    } finally {

      setLoading(false);

      setRefreshing(false);

    }
  }

  useEffect(()=>{
    loadAnalytics();
  },[]);

  function formatDate(
    value?:string
  ){

    if(!value)
      return "No upcoming posts";

    return new Date(
      value
    ).toLocaleString(
      [],
      {
        month:"short",
        day:"numeric",
        year:"numeric",
        hour:"numeric",
        minute:"2-digit",
      }
    );

  }

  if(loading){

    return(

      <View style={styles.center}>

        <ActivityIndicator
          size="large"
        />

        <Text
          style={styles.loadingText}
        >
          Loading analytics...
        </Text>

      </View>

    );

  }

  return(

<ScrollView

style={styles.container}

contentContainerStyle={
styles.content
}

refreshControl={

<RefreshControl

refreshing={refreshing}

onRefresh={()=>{

setRefreshing(true);

loadAnalytics();

}}

 />

}

>

<Text style={styles.title}>
Analytics Dashboard
</Text>

{error ? (

<Text style={styles.error}>
{error}
</Text>

) : null}

<View style={styles.grid}>

<StatCard
label="Total Campaigns"
value={analytics?.total||0}
/>

<StatCard
label="Scheduled"
value={analytics?.scheduled||0}
/>

<StatCard
label="Published"
value={analytics?.published||0}
/>

<StatCard
label="Failed"
value={analytics?.failed||0}
/>

<StatCard
label="Success Rate"
value={
analytics?.successRate||0
}
/>

<StatCard
label="Saved Drafts"
value={analytics?.saved||0}
/>

<StatCard
label="Active"
value={analytics?.active||0}
/>

<StatCard
label="Paused"
value={analytics?.paused||0}
/>

<StatCard
label="Unread Alerts"
value={analytics?.unread||0}
/>

<StatCard
label="Pinterest"
value={
analytics?.pinterestConnected
? 1
: 0
}
/>

</View>

<View style={styles.panel}>

<Text style={styles.panelTitle}>
Next Scheduled Post
</Text>

<Text style={styles.panelText}>

{analytics?.upcoming

? analytics.upcoming.title

: "No upcoming campaign found"}

</Text>

<Text style={styles.panelSubText}>

{analytics?.upcoming

? formatDate(
analytics.upcoming.publishAt
)

: "Schedule a campaign"}

</Text>

</View>

</ScrollView>

);

}

function StatCard({
label,
value
}:{
label:string;
value:number;
}){

return(

<View style={styles.card}>

<Text style={styles.cardValue}>
{value}
</Text>

<Text style={styles.cardLabel}>
{label}
</Text>

</View>

);

}

const styles=
StyleSheet.create({

container:{
flex:1,
backgroundColor:"#0B0F19",
},

content:{
padding:20,
paddingBottom:40,
},

center:{
flex:1,
alignItems:"center",
justifyContent:"center",
backgroundColor:"#0B0F19",
},

loadingText:{
color:"#fff",
marginTop:12,
},

title:{
fontSize:28,
fontWeight:"800",
color:"#fff",
marginBottom:12,
},

error:{
padding:12,
borderRadius:10,
backgroundColor:"#3A1111",
color:"#FFB4B4",
marginBottom:16,
},

grid:{
flexDirection:"row",
flexWrap:"wrap",
gap:12,
},

card:{
width:"47%",
backgroundColor:"#151B2B",
padding:18,
borderRadius:18,
},

cardValue:{
fontSize:30,
fontWeight:"900",
color:"#fff",
},

cardLabel:{
color:"#AAB2C0",
},

panel:{
backgroundColor:"#151B2B",
padding:18,
borderRadius:18,
marginTop:18,
},

panelTitle:{
color:"#fff",
fontWeight:"800",
fontSize:18,
},

panelText:{
color:"#fff",
fontWeight:"700",
marginTop:8,
},

panelSubText:{
color:"#AAB2C0",
marginTop:5,
},

});