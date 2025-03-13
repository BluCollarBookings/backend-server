require('dotenv').config(); // Load environment variables
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
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
    databaseURL: "https://blucollarbookings.firebaseio.com" // Replace with your actual Firebase Database URL
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

// ✅ Serve static files from React frontend
app.use(express.static(path.join(__dirname, '../build')));

// ✅ Route to handle Square OAuth callback (GET)
app.get('/api/square/oauth/callback', async (req, res) => {
    const authorizationCode = req.query.code;
    const companyUUID = req.query.state; // Square passes state as companyUUID

    console.log("\n✅ Received OAuth Callback");
    console.log("🔹 Authorization Code:", authorizationCode);
    console.log("🔹 Company UUID:", companyUUID);

    if (!authorizationCode || !companyUUID) {
        console.error("❌ Missing Authorization Code or Company UUID");
        return res.status(400).json({ error: 'Authorization code and company UUID are required.' });
    }

    try {
        // ✅ Exchange authorization code for access token
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            code: authorizationCode,
            grant_type: 'authorization_code',
            redirect_uri: SQUARE_REDIRECT_URI,
        });

        console.log("✅ Square OAuth Response:", response.data);

        const { access_token, refresh_token, expires_at } = response.data;

        console.log("🔄 Saving to Firebase...");
        console.log(`🔥 Firebase Path: users/companies/${companyUUID}/companySettings`);
        console.log("🔹 Access Token:", access_token);

        // ✅ Save to Firebase
        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token,
            squareRefreshToken: refresh_token,
            squareTokenExpiresAt: expires_at
        });

        console.log(`✅ Access token successfully saved for companyUUID: ${companyUUID}`);

        // ✅ Redirect back to Flutter app
        const appRedirectUri = `blucollarbookingsflutterapp://square-success`;
        res.redirect(appRedirectUri);
    } catch (err) {
        console.error("❌ Error exchanging Square OAuth token:", err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

// ✅ POST route for Square OAuth callback (alternative method)
app.post('/api/square/oauth/callback', async (req, res) => {
    const { authorization_code, companyUUID } = req.body;

    console.log("\n📥 Received POST OAuth Callback");
    console.log("🔹 Authorization Code:", authorization_code);
    console.log("🔹 Company UUID:", companyUUID);

    if (!authorization_code || !companyUUID) {
        return res.status(400).json({ error: 'Authorization code and company UUID are required.' });
    }

    try {
        // ✅ Exchange authorization code for access token
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            code: authorization_code,
            grant_type: 'authorization_code',
            redirect_uri: SQUARE_REDIRECT_URI,
        });

        const { access_token, refresh_token, expires_at } = response.data;

        console.log('✅ Access Token:', access_token);
        console.log('🔄 Refresh Token:', refresh_token);

        // ✅ Save access token to Firebase under companySettings
        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token,
            squareRefreshToken: refresh_token,
            squareTokenExpiresAt: expires_at
        });

        console.log(`✅ Successfully saved Square tokens for companyUUID: ${companyUUID}`);

        res.status(200).json({ access_token, refresh_token, expires_at });
    } catch (err) {
        const errorResponse = err.response?.data || err.message;
        console.error('❌ Error exchanging Square OAuth token:', errorResponse);

        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

// ✅ Test route to check if the server is running
app.get('/api/square/test', (req, res) => {
    res.send('✅ Square OAuth integration is working!');
});

// ✅ Debug logging for all incoming requests
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.originalUrl}`);
    next();
});

// ✅ Fallback: Serve React's index.html for any other request
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// ✅ Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
