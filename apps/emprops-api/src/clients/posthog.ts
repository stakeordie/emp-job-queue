import { PostHog } from "posthog-node";

// Create PostHog client only if API key is provided
let posthog: PostHog | null = null;

if (process.env.POSTHOG_API_KEY) {
  posthog = new PostHog(process.env.POSTHOG_API_KEY, {
    host: process.env.POSTHOG_HOST,
  });
} else {
  // Create a mock client for development/testing
  posthog = {
    capture: () => {},
    identify: () => {},
    shutdown: () => {},
  } as any;
}

export default posthog;
