// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const sharedRoutes = require('./routes/shared');
const stripeRoutes = require('./routes/stripe');
//const clothingRoutes = require('./routes/clothing');
//const constructionRoutes = require('./routes/construction');

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
app.use('/api/stripe', stripeRoutes);

//app.use('/api/clothing', clothingRoutes); // Mount the clothing routes
//app.use('/api/construction', constructionRoutes); // Mount the construction routes

app.get("/test", (req, res) => {
    res.send("Express server is working!");
});

// Start the server
app.listen(PORT, "0.0.0.0", () => { // το 2ο argument -> "0.0.0.0" μπηκε για να κανω expose σε τοπικο δικτυο τον σερβερ (προεραιτικο)
    console.log(`Server is running on ${PORT}`);
});