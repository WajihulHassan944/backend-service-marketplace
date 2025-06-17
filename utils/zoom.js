import fetch from 'node-fetch';

export const getZoomAccessToken = async () => {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  const accountId = process.env.ZOOM_ACCOUNT_ID;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenUrl = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;

  try {
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`Failed to get token: ${error.message}`);
    }

    const data = await res.json();
    return data.access_token;
  } catch (err) {
    console.error("Zoom token error:", err);
    throw new Error("Zoom access token fetch failed");
  }
};
