// ARTBOOST_CAMPAIGN_MULTI_PLATFORM_FANOUT_V1
export type CampaignPlatformResult = {
  platform: string;
  success: boolean;
  message?: string;
};

export async function runCampaignPlatformFanout(
  platforms: readonly string[],
  publishOne: (platform: string) => Promise<{ success: boolean; message?: string }>
): Promise<CampaignPlatformResult[]> {
  const results: CampaignPlatformResult[] = [];

  for (const platform of platforms) {
    try {
      const result = await publishOne(platform);
      results.push({
        platform,
        success: Boolean(result?.success),
        ...(result?.message ? { message: String(result.message) } : {}),
      });
    } catch (error: any) {
      results.push({
        platform,
        success: false,
        message: error?.message || "Publishing failed.",
      });
    }
  }

  return results;
}
