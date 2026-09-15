// ARTBOOST_STRIPE_WEB_COMPATIBILITY_V1_1_20260915
import { StripeProvider } from "@stripe/stripe-react-native";
import type { PropsWithChildren } from "react";

const stripePublishableKey =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function ArtBoostStripeProvider({
  children,
}: PropsWithChildren) {
  // StripeProvider's installed typings require ReactElement children rather than
  // ReactNode. A Fragment guarantees one ReactElement without changing rendering.
  return (
    <StripeProvider publishableKey={stripePublishableKey}>
      <>{children}</>
    </StripeProvider>
  );
}
