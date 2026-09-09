// ARTBOOST_FINAL_LAUNCH_FIX_V1_20260909
// Analytics is intentionally hidden for the launch build.
// Keep the route fail-closed so stale links cannot expose unfinished analytics.
import React from "react";
import { Redirect } from "expo-router";

export default function AnalyticsLaunchRedirect() {
  return <Redirect href={"/(tabs)/connections" as any} />;
}
