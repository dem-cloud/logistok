// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const sharedRoutes = require('./routes/shared');
const clothingRoutes = require('./routes/clothing');
const constructionRoutes = require('./routes/construction');

// Create Application Object
const app = express();
const PORT = process.env.PORT || 4000;

const corsOptions = {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json()); // To parse JSON bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies
app.use(cookieParser());

// Use the routes
app.use('/api/auth', authRoutes); // Mount the auth routes
app.use('/api/shared', sharedRoutes); // Mount the shared routes
app.use('/api/clothing', clothingRoutes); // Mount the clothing routes
app.use('/api/construction', constructionRoutes); // Mount the construction routes

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});