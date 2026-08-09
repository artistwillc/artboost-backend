let publishers = null;

export function registerSocialPublishers({
  publishPinterestPin,
  publishFacebookPost,
  publishInstagramPost,
  publishXPost,
  publishThreadsPost,
  publishLinkedInPost,
}) {
  publishers = {
    publishPinterestPin,
    publishFacebookPost,
    publishInstagramPost,
    publishXPost,
    publishThreadsPost,
    publishLinkedInPost,
  };
}

function getPublishers() {
  if (!publishers) {
    throw new Error("Social publishers have not been registered.");
  }

  return publishers;
}

export async function publishPinterest(options) {
  return getPublishers().publishPinterestPin(options);
}

export async function publishFacebook(options) {
  return getPublishers().publishFacebookPost(options);
}

export async function publishInstagram(options) {
  return getPublishers().publishInstagramPost(options);
}

export async function publishX(options) {
  return getPublishers().publishXPost(options);
}

export async function publishThreads(options) {
  return getPublishers().publishThreadsPost(options);
}

export async function publishLinkedIn(options) {
  return getPublishers().publishLinkedInPost(options);
}
