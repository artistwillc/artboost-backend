// ARTBOOST_CONSULTANT_ROUTE_REGISTRY_V16_5
export const ARTBOOST_ROUTE_REGISTRY = [
  { id:"home", title:"Home", route:"/(tabs)", actionId:"open_home", aliases:["home","dashboard","main screen"], purpose:"ArtBoost home and quick actions.", launchEnabled:true },
  { id:"library", title:"Library", route:"/(tabs)/products", actionId:"open_library", aliases:["library","products","artwork","listings","catalog"], purpose:"Imported products and artwork from connected stores.", launchEnabled:true },
  { id:"connections", title:"Connections", route:"/(tabs)/connections", actionId:"open_connections", aliases:["connections","connect","connected stores","social connections"], purpose:"Connect, review, and reconnect stores and social platforms.", launchEnabled:true },
  { id:"consultant", title:"AI Consultant", route:"/(tabs)/consultant", actionId:"open_ai_consultant", aliases:["ai consultant","consultant","marketing agent"], purpose:"Personal ArtBoost AI art and marketing agent.", launchEnabled:true },
  { id:"more", title:"More", route:"/(tabs)/more", actionId:"open_more", aliases:["more","more tools","tools"], purpose:"Additional ArtBoost tools and settings.", launchEnabled:true },
  { id:"schedule", title:"Schedule", route:"/(tabs)/schedule", actionId:"open_schedule", aliases:["schedule","scheduled posts","automation schedule"], purpose:"Review store automations and scheduled publishing.", launchEnabled:true },
  { id:"campaign_manager", title:"Campaign Manager", route:"/campaign-manager", actionId:"open_campaign_manager", aliases:["campaign manager","campaign","campaigns"], purpose:"Create and manage social publishing campaigns.", launchEnabled:true },
  { id:"campaign_history", title:"Campaign History", route:"/(tabs)/history", actionId:"open_campaign_history", aliases:["campaign history","history"], purpose:"Review campaign activity and outcomes.", launchEnabled:true },
  { id:"publishing_history", title:"Publishing History", route:"/publishing-history", actionId:"view_publishing_history", aliases:["publishing history","post history","posting history","failed posts","skipped posts"], purpose:"Review first-party scheduler publishing results and errors.", launchEnabled:true },
  { id:"video_studio", title:"Video Studio", route:"/video-studio", actionId:"open_studio", aliases:["video studio","create video","videos"], purpose:"Create marketing videos from artwork.", launchEnabled:true },
  { id:"created_videos", title:"Created Videos", route:"/created-videos", actionId:"open_created_videos", aliases:["created videos","my videos","saved videos"], purpose:"Review previously created ArtBoost videos.", launchEnabled:true },
  { id:"creator_tools", title:"Creator Tools", route:"/(tabs)/explore", actionId:"open_creator_tools", aliases:["creator tools","tools for creators"], purpose:"ArtBoost creator utilities.", launchEnabled:true },
  { id:"connect_store", title:"Connect Store", route:"/connect-store", actionId:"open_connect_store", aliases:["connect store","add store","new store"], purpose:"Add a supported store connection.", launchEnabled:true },
  { id:"catalog_importer", title:"Catalog Importer", route:"/catalog-importer", actionId:"open_catalog_importer", aliases:["catalog importer","import store","import products"], purpose:"Import products into ArtBoost.", launchEnabled:true },
  { id:"catalog_urls", title:"Product URL Import", route:"/catalog-import-urls", actionId:"open_product_url_import", aliases:["product urls","url import","import url","product url"], purpose:"Import products from supported listing URLs.", launchEnabled:true },
  { id:"catalog_csv", title:"CSV Import", route:"/catalog-import-csv", actionId:"open_csv_import", aliases:["csv import","import csv","csv"], purpose:"Import product data from CSV.", launchEnabled:true },
  { id:"store_scanner", title:"AI Store Scanner", route:"/ai-store-scanner", actionId:"open_store_scanner", aliases:["store scanner","ai store scanner","scan store","universal scanner"], purpose:"Discover products from supported public storefront pages.", launchEnabled:true },
  { id:"artpal_scanner", title:"ArtPal Store Scanner", route:"/artpal-store-scanner", actionId:"open_artpal_scanner", aliases:["artpal scanner","scan artpal"], purpose:"Discover ArtPal products using the ArtPal scanner.", launchEnabled:true },
  { id:"consultant_settings", title:"Consultant Settings", route:"/consultant-settings", actionId:"open_consultant_settings", aliases:["consultant settings","rename consultant","ai name"], purpose:"Configure the AI Consultant.", launchEnabled:true },
  { id:"faq", title:"Help & FAQ", route:"/faq", actionId:"open_faq", aliases:["help","faq","customer service","support"], purpose:"ArtBoost help and product guidance.", launchEnabled:true },
  { id:"subscription", title:"Subscription", route:"/(tabs)/pro", actionId:"open_subscription", aliases:["subscription","billing","plan","starter","pro","business"], purpose:"Review ArtBoost subscription access and billing information.", launchEnabled:true },
  { id:"saved", title:"Saved Campaigns", route:"/saved", actionId:"open_saved_campaigns", aliases:["saved campaigns","saved posts","saved"], purpose:"Review saved campaign drafts.", launchEnabled:true },
  { id:"notifications", title:"Notifications", route:"/notifications", actionId:"open_notifications", aliases:["notifications","alerts"], purpose:"Review ArtBoost notifications and alerts.", launchEnabled:true },
  { id:"notification_settings", title:"Notification Settings", route:"/notification-settings", actionId:"open_notification_settings", aliases:["notification settings","alert settings"], purpose:"Configure ArtBoost notification preferences.", launchEnabled:true },
  { id:"store_dashboard", title:"Store Dashboard", route:"/(tabs)/store-dashboard", actionId:"open_store_dashboard", aliases:["store dashboard","store details","store products"], purpose:"Review one connected store and its ArtBoost catalog.", launchEnabled:true },
  { id:"automation", title:"Store Automation", route:"/store-automation", actionId:"open_store_automation", aliases:["store automation","automation","automatic posting"], purpose:"Configure a store publishing automation.", launchEnabled:true }
];
export const CONSULTANT_ROUTE_ACTIONS = Object.fromEntries(ARTBOOST_ROUTE_REGISTRY.filter(x=>x.launchEnabled!==false).map(x=>[x.actionId,{label:`Open ${x.title}`,route:x.route}]));
const clean=(v)=>String(v||"").trim().toLowerCase();
export function routeRegistryForPrompt(){return ARTBOOST_ROUTE_REGISTRY.filter(x=>x.launchEnabled!==false).map(({id,title,route,actionId,purpose})=>({id,title,route,actionId,purpose}));}
export function findRouteForQuestion(question){
  const q=` ${clean(question)} `;
  if(!/\b(?:open|go to|take me|where|which tab|what tab|find|navigate|screen|page|how do i get|how can i get)\b/.test(q)) return null;
  const matches=ARTBOOST_ROUTE_REGISTRY.filter(x=>x.launchEnabled!==false).map(item=>({item,score:[item.title,...(item.aliases||[])].map(clean).filter(Boolean).reduce((best,t)=>q.includes(` ${t} `)?Math.max(best,100+t.length):q.includes(t)?Math.max(best,t.length):best,0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return matches[0]?.item||null;
}
