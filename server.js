require('dotenv').config(); // Load environment variables from the .env file
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccount = require('./path-to-your-firebase-admin-sdk.json'); // Replace with your Firebase Admin SDK JSON file

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your-database-name.firebaseio.com" // Replace with your Firebase Database URL
});

const db = admin.database();

// Environment variables for Square OAuth
const SQUARE_CLIENT_ID = process.env.SQUARE_CLIENT_ID;
const SQUARE_CLIENT_SECRET = process.env.SQUARE_CLIENT_SECRET;
const SQUARE_REDIRECT_URI = process.env.SQUARE_REDIRECT_URI;

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the React app's build directory
app.use(express.static(path.join(__dirname, '../build')));

// Route to handle Square OAuth callback for GET requests
app.get('/api/square/oauth/callback', async (req, res) => {
    const authorizationCode = req.query.code;
    const companyUUID = req.query.state; // The state parameter should hold the companyUUID

    if (!authorizationCode || !companyUUID) {
        return res.status(400).json({ error: 'Authorization code and company UUID are required.' });
    }

    try {
        // Exchange authorization code for access token
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            code: authorizationCode,
            grant_type: 'authorization_code',
            redirect_uri: SQUARE_REDIRECT_URI,
        });

        const { access_token, refresh_token, expires_at } = response.data;

        console.log('✅ Access Token:', access_token);
        console.log('🔄 Refresh Token:', refresh_token);

        // Save access token to Firebase under companySettings
        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token
        });

        console.log(`✅ Access token saved in Firebase for companyUUID: ${companyUUID}`);

        // Redirect back to the Flutter app
        const appRedirectUri = `blucollarbookingsflutterapp://square-success`;
        res.redirect(appRedirectUri);
    } catch (err) {
        const errorResponse = err.response?.data || err.message;
        console.error('❌ Error exchanging Square OAuth token:', errorResponse);

        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

// POST route for debugging (if needed for testing authorization_code submission)
app.post('/api/square/oauth/callback', async (req, res) => {
    const { authorization_code, companyUUID } = req.body;

    if (!authorization_code || !companyUUID) {
        return res.status(400).json({ error: 'Authorization code and company UUID are required.' });
    }

    try {
        // Square OAuth Token Exchange API
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

        // Save access token to Firebase under companySettings
        await db.ref(`users/companies/${companyUUID}/companySettings`).update({
            squareAccessToken: access_token
        });

        res.status(200).json({ access_token, refresh_token, expires_at });
    } catch (err) {
        const errorResponse = err.response?.data || err.message;
        console.error('❌ Error exchanging Square OAuth token:', errorResponse);

        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

// Test route to check if the server is running
app.get('/api/square/test', (req, res) => {
    res.send('Square OAuth integration is working!');
});

// Debug logging for all incoming requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
});

// Fallback: Serve React's index.html for any other request
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});