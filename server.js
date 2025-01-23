require('dotenv').config({ path: './.env' }); // Load environment variables from the .env file
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');

// Environment variables for Square OAuth
const SQUARE_CLIENT_ID = process.env.SQUARE_CLIENT_ID;
const SQUARE_CLIENT_SECRET = process.env.SQUARE_CLIENT_SECRET;
const SQUARE_REDIRECT_URI = process.env.SQUARE_REDIRECT_URI;

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(bodyParser.json()); // Parse JSON request bodies

// Route to handle Square OAuth callback for GET requests
app.get('/api/square/oauth/callback', async (req, res) => {
    const authorizationCode = req.query.code; // Extract the authorization code from the query parameters

    if (!authorizationCode) {
        return res.status(400).json({ error: 'Authorization code is required.' });
    }

    try {
        // Square OAuth Token Exchange API
        const response = await axios.post('https://connect.squareup.com/oauth2/token', {
            client_id: SQUARE_CLIENT_ID,
            client_secret: SQUARE_CLIENT_SECRET,
            code: authorizationCode,
            grant_type: 'authorization_code',
            redirect_uri: SQUARE_REDIRECT_URI,
        });

        const { access_token, refresh_token, expires_at } = response.data;

        // Log the access token (for debugging purposes, remove in production)
        console.log('Square Access Token:', access_token);

        // Redirect back to the app using a deep link
        const appRedirectUri = `com.example.rvautoservicecompany://square-success?access_token=${access_token}&refresh_token=${refresh_token}`;
        res.redirect(appRedirectUri);
    } catch (err) {
        console.error('Error exchanging Square OAuth token:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to exchange authorization code.' });
    }
});

// POST route for debugging (if needed for testing authorization_code submission)
app.post('/api/square/oauth/callback', async (req, res) => {
    const { authorization_code } = req.body; // Extract the authorization code from the request body

    if (!authorization_code) {
        return res.status(400).json({ error: 'Authorization code is required.' });
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

        // Log the access token (for debugging purposes, remove in production)
        console.log('Square Access Token:', access_token);

        // Send the tokens back to the client
        res.status(200).json({
            access_token,
            refresh_token,
            expires_at,
        });
    } catch (err) {
        console.error('Error exchanging Square OAuth token:', err.response?.data || err.message);
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

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});