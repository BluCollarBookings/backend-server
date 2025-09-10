require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const admin = require('firebase-admin');

// ✅ Load Firebase credentials from Render environment variable
const serviceAccountBase64 = process.env.FIREBASE_CREDENTIALS;
if (!serviceAccountBase64) {
    console.error("❌ Firebase credentials are missing. Set FIREBASE_CREDENTIALS in Render.");
    process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://blucollarbookings-default-rtdb.firebaseio.com/" // ✅ Correct Firebase URL
});
const db = admin.database();

// ✅ Check Firebase connection
db.ref("test").set({ status: "working" })
    .then(() => console.log("🔥 Firebase test write successful"))
    .catch(err => console.error("❌ Firebase test write failed:", err));

// ✅ Environment variables for Square OAuth
const SQUARE_CLIENT_ID = process.env.SQUARE_CLIENT_ID;
const SQUARE_CLIENT_SECRET = process.env.SQUARE_CLIENT_SECRET;
const SQUARE_REDIRECT_URI = process.env.SQUARE_REDIRECT_URI;

// ✅ Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Middleware
app.use(cors());
app.use(bodyParser.json());

/**
 * ✅ Function to refresh Square Access Token before it expires
 */
async function refreshSquareAccessToken(companyUUID, refreshToken) {
    console.log(`🔄 Refreshing Square Access Token for companyUUID: ${companyUUID}`);

    try {
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        });

        const { access_token, refresh_token: newRefreshToken, expires_at } = response.data;

        console.log("✅ Square OAuth Token Refreshed Successfully");
        console.log("🔄 Saving new tokens to Firebase...");

        // ✅ Save updated access & refresh tokens
        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token,
            squareRefreshToken: newRefreshToken,
            squareTokenExpiresAt: expires_at,
        });

        console.log(`✅ New access token saved for companyUUID: ${companyUUID}`);
        return access_token;
    } catch (err) {
        console.error("❌ Error refreshing Square OAuth token:", err.response?.data || err.message);
        return null;
    }
}

/**
 * ✅ Middleware to verify and refresh Square tokens automatically
 */
app.use(async (req, res, next) => {
    if (req.path.startsWith("/api/square/")) {
        const companyUUID = req.query.companyUUID || req.body.companyUUID;

        if (companyUUID) {
            const companyRef = db.ref(`users/companies/${companyUUID}/companySettings`);
            const snapshot = await companyRef.once("value");
            const companyData = snapshot.val();

            if (companyData) {
                const { squareAccessToken, squareRefreshToken, squareTokenExpiresAt } = companyData;
                const now = new Date();

                if (new Date(squareTokenExpiresAt) < now) {
                    console.log(`🔄 Token expired, refreshing access token for ${companyUUID}`);
                    const newToken = await refreshSquareAccessToken(companyUUID, squareRefreshToken);
                    if (newToken) {
                        req.squareAccessToken = newToken; // Attach new token for API calls
                    }
                } else {
                    req.squareAccessToken = squareAccessToken;
                }
            }
        }
    }
    next();
});

/**
 * ✅ Route to handle Square OAuth callback
 */
app.get('/api/square/oauth/callback', async (req, res) => {
    const authorizationCode = req.query.code;
    const companyUUID = req.query.state; // 🔑 The `state` param ties back to companyUUID

    console.log("\n✅ Received OAuth Callback");
    console.log("🔹 Authorization Code:", authorizationCode);
    console.log("🔹 Company UUID:", companyUUID);

    if (!authorizationCode || !companyUUID) {
        console.error("❌ Missing Authorization Code or Company UUID");
        return res.status(400).json({ error: 'Authorization code and company UUID are required.', receivedUUID: companyUUID });
    }

    try {
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            code: authorizationCode,
            grant_type: 'authorization_code',
            redirect_uri: SQUARE_REDIRECT_URI,
        });

        const { access_token, refresh_token, expires_at, merchant_id } = response.data;

        console.log("✅ Square OAuth Response:", response.data);
        console.log("🔄 Saving to Firebase...");
        console.log(`🔥 Firebase Path: users/companies/${companyUUID}/companySettings`);
        console.log("🔹 Access Token:", access_token);

        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token,
            squareRefreshToken: refresh_token,
            squareTokenExpiresAt: expires_at,
            squareMerchantId: merchant_id
        });

        console.log(`✅ Access token successfully saved for companyUUID: ${companyUUID}`);

        // ✅ Redirect explicitly back to Flutter
        const appRedirectUri = `blucollarbookingsflutterapp://square-success`;
        console.log(`🔄 Redirecting to Flutter: ${appRedirectUri}`);
        res.redirect(appRedirectUri);
    } catch (err) {
        console.error("❌ Error exchanging Square OAuth token:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

/**
 * ✅ Test route to check if the server is running
 */
app.get('/api/square/test', (req, res) => {
    res.send('✅ Square OAuth integration is working!');
});

/**
 * ✅ Debug logging for all incoming requests
 */
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.originalUrl}`);
    next();
});

/**
 * ✅ Start the server
 */
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
