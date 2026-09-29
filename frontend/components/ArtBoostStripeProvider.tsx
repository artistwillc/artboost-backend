// ARTBOOST_STRIPE_PLATFORM_SAFE_V2_20260929
import type { PropsWithChildren } from "react";
import { Platform } from "react-native";

type ProviderProps = PropsWithChildren;

function WebStripePassThrough({ children }: ProviderProps) {
  return <>{children}</>;
}

export default function ArtBoostStripeProvider(props: ProviderProps) {
  if (Platform.OS === "web") {
    return <WebStripePassThrough {...props} />;
  }

  // Keep the native Stripe module out of the browser execution path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { StripeProvider } = require("@stripe/stripe-react-native");
  const stripePublishableKey =
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

  return (
    <StripeProvider publishableKey={stripePublishableKey}>
      <>{props.children}</>
    </StripeProvider>
  );
}
