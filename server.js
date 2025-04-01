const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const { Scraper } = require('agent-twitter-client');
const { Cookie } = require('tough-cookie');
const { tuner } = require('./timelineTuner.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'timeline-tuner-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize passport for OAuth
app.use(passport.initialize());
app.use(passport.session());

// Configure Passport
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Only configure Twitter OAuth Strategy if keys are present
const TWITTER_CONSUMER_KEY = process.env.TWITTER_CONSUMER_KEY;
const TWITTER_CONSUMER_SECRET = process.env.TWITTER_CONSUMER_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/auth/twitter/callback';

// Flag to track if OAuth is configured
const isOAuthConfigured = !!(TWITTER_CONSUMER_KEY && TWITTER_CONSUMER_SECRET);

if (isOAuthConfigured) {
  console.log('Twitter OAuth is configured and enabled');
  passport.use(new TwitterStrategy({
      consumerKey: TWITTER_CONSUMER_KEY,
      consumerSecret: TWITTER_CONSUMER_SECRET,
      callbackURL: CALLBACK_URL,
      includeEmail: true
    },
    (token, tokenSecret, profile, done) => {
      // Save credentials in the user object
      const user = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        token: token,
        tokenSecret: tokenSecret
      };
      return done(null, user);
    }
  ));
} else {
  console.log('Twitter OAuth is not configured. One-click login will be disabled.');
}

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', (req, res) => {
  const isLoggedIn = req.session.twitterCookies ? true : false;
  res.render('index', { isLoggedIn });
});

app.get('/login', (req, res) => {
  // If error parameter is present, pass it to the template
  const error = req.query.error || null;
  res.render('login', { error, oauthEnabled: isOAuthConfigured });
});

// OAuth routes - only enabled if Twitter keys are configured
if (isOAuthConfigured) {
  app.get('/auth/twitter', passport.authenticate('twitter'));

  app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/login?error=oauth_failed' }),
    async (req, res) => {
      try {
        // The user credentials are now in req.user
        req.session.twitterUsername = req.user.username;
        
        // Create a scraper
        const scraper = new Scraper();
        
        // We need to access the internal auth property directly since Scraper doesn't expose loginWithV2
        // The auth property of Scraper is a TwitterAuth instance
        if (scraper.auth && typeof scraper.auth.loginWithV2 === 'function') {
          scraper.auth.loginWithV2(
            TWITTER_CONSUMER_KEY,
            TWITTER_CONSUMER_SECRET,
            req.user.token,
            req.user.tokenSecret
          );
        } else {
          console.log('Using an alternative method to authenticate the Scraper');
          // Create an auth instance manually
          const { TwitterUserAuth } = require('agent-twitter-client');
          const userAuth = new TwitterUserAuth(
            // Pass the bearer token from the existing auth
            scraper.auth ? scraper.auth.bearerToken : process.env.BEARER_TOKEN || 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
          );
          
          // Login with the tokens
          userAuth.loginWithV2(
            TWITTER_CONSUMER_KEY,
            TWITTER_CONSUMER_SECRET, 
            req.user.token,
            req.user.tokenSecret
          );
          
          // Replace the auth property
          scraper.auth = userAuth;
          scraper.authTrends = userAuth;
        }
        
        // Get cookies from the authenticated scraper and store them
        const cookies = await scraper.getCookies();
        console.log('OAuth authenticated user cookies:');
        cookies.forEach((cookie, index) => {
          console.log(`Cookie ${index + 1}: ${cookie.key}=${cookie.value.substring(0, 5)}...`);
        });
        
        // Format cookies for session storage
        req.session.twitterCookies = cookies.map(c => c.toString());
        console.log(`Total cookies stored in session: ${req.session.twitterCookies.length}`);
        
        // Try to get the user profile to confirm authentication worked
        try {
          const profile = await scraper.me();
          if (profile) {
            console.log(`Successfully authenticated as: ${profile.username}`);
            req.session.twitterUsername = profile.username;
          } else {
            console.log('Authentication succeeded but could not fetch profile');
          }
        } catch (profileError) {
          console.error('Error fetching user profile:', profileError);
        }
        
        res.redirect('/dashboard');
      } catch (error) {
        console.error('Error in OAuth callback:', error);
        res.redirect('/login?error=authentication_failed');
      }
    });
} else {
  // Fallback routes when OAuth is not configured
  app.get('/auth/twitter', (req, res) => {
    res.redirect('/login?error=oauth_not_configured');
  });
}

// Login with Twitter credentials
app.post('/login-with-credentials', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }

    console.log(`Attempting login for user: @${username}`);
    
    // Create and initialize the tuner with credentials
    const loginResult = await tuner.login(username, password, email);
    
    if (loginResult) {
      console.log(`Successfully logged in as: @${username}`);
      
      // Store login info in session
      req.session.twitterUsername = username;
      req.session.isLoggedIn = true;
      
      // Get profile to verify authentication
      try {
        const profile = await tuner.scraper.me();
        if (profile) {
          req.session.twitterUsername = profile.username;
          console.log(`Verified profile: @${profile.username}`);
        }
      } catch (profileError) {
        console.error('Error fetching profile after login:', profileError);
      }
      
      // Store the tuner instance in the application for use across requests
      req.app.locals.tuner = tuner;

      return res.json({ 
        success: true, 
        message: 'Login successful',
        username: req.session.twitterUsername
      });
    } else {
      return res.status(401).json({ 
        success: false, 
        message: 'Login failed. Please check your credentials.'
      });
    }
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error during login: ' + (error.message || 'Unknown error')
    });
  }
});

app.post('/save-cookies', async (req, res) => {
  try {
    // Parse the cookies from the request body
    const twitterCookies = req.body.cookies;
    
    if (!twitterCookies || twitterCookies.length === 0) {
      return res.status(400).json({ success: false, message: 'No cookies provided' });
    }

    // Store cookies in session
    req.session.twitterCookies = twitterCookies;
    req.session.twitterUsername = req.body.username || 'Twitter User';
    req.session.isLoggedIn = true;
    
    console.log('Manual cookie login:');
    console.log(`Received ${twitterCookies.length} cookies from form submission`);
    twitterCookies.forEach((cookieStr, index) => {
      console.log(`Raw Cookie ${index + 1}: ${cookieStr.substring(0, 15)}...`);
    });
    
    // Test cookies by checking if we can access Twitter
    const scraper = new Scraper();
    const cookieObjects = twitterCookies.map(cookieStr => Cookie.parse(cookieStr));
    
    console.log('Parsed cookie objects:');
    cookieObjects.forEach((cookie, index) => {
      console.log(`Cookie ${index + 1}: ${cookie.key}=${cookie.value.substring(0, 5)}...`);
    });
    
    await scraper.setCookies(cookieObjects);
    console.log('Cookies set in scraper');
    
    // Try to get the user's profile
    try {
      const profile = await scraper.me();
      if (profile) {
        console.log(`Successfully authenticated as: ${profile.username}`);
        req.session.twitterUsername = profile.username;
        
        // Initialize the tuner with the scraper
        tuner.scraper = scraper;
        req.app.locals.tuner = tuner;
        
        return res.json({ success: true, message: 'Cookies saved successfully', username: profile.username });
      } else {
        console.log('Could not fetch profile, but no error was thrown');
      }
    } catch (error) {
      console.error('Error verifying profile:', error);
    }
    
    return res.json({ success: true, message: 'Cookies saved but could not verify profile' });
  } catch (error) {
    console.error('Error saving cookies:', error);
    return res.status(500).json({ success: false, message: 'Error saving cookies' });
  }
});

app.get('/dashboard', (req, res) => {
  // Check if user is logged in via cookies or credentials
  if (!req.session.isLoggedIn && !req.session.twitterCookies) {
    return res.redirect('/login');
  }
  
  // Get tuner instance if available
  const tunerInstance = req.app.locals.tuner;
  const isTunerActive = tunerInstance && tunerInstance.isActive();
  
  // Get current preferences (use getPreferences method, with fallback to getConcept for backwards compatibility)
  let currentPreferences = '';
  if (tunerInstance) {
    if (typeof tunerInstance.getPreferences === 'function') {
      currentPreferences = tunerInstance.getPreferences();
    } else if (typeof tunerInstance.getConcept === 'function') {
      currentPreferences = tunerInstance.getConcept();
    }
  }
  
  // Get engagement settings for UI
  const engagementSettings = {
    enableLikes: true,     // Default to true
    enableFollows: true,   // Default to true
    enableDislikes: true   // Default to true
  };
  
  // Override with actual settings if tuner exists
  if (tunerInstance) {
    if (tunerInstance.enableLikes !== undefined) {
      engagementSettings.enableLikes = tunerInstance.enableLikes;
    }
    if (tunerInstance.enableFollows !== undefined) {
      engagementSettings.enableFollows = tunerInstance.enableFollows;
    }
    if (tunerInstance.enableDislikes !== undefined) {
      engagementSettings.enableDislikes = tunerInstance.enableDislikes;
    }
  }
  
  res.render('dashboard', { 
    username: req.session.twitterUsername || 'Twitter User',
    isActive: isTunerActive || req.session.tuningActive || false,
    concept: currentPreferences || req.session.concept || '', // Still use 'concept' key for template compatibility
    engagementSettings
  });
});

app.post('/start-tuning', async (req, res) => {
  try {
    // Check if user is logged in via cookies or credentials
    if (!req.session.isLoggedIn && !req.session.twitterCookies) {
      return res.status(401).json({ success: false, message: 'Not logged in' });
    }
    
    const { concept } = req.body; // Still accepting 'concept' from frontend for backward compatibility
    const preferences = concept; // Map to 'preferences' for new terminology
    
    if (!preferences || preferences.trim() === '') {
      return res.status(400).json({ success: false, message: 'Content preference is required' });
    }
    
    // Store the preferences in the session (still using concept key for compatibility)
    req.session.concept = preferences;
    
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance && tunerInstance.scraper) {
      console.log(`Starting timeline tuning with preferences: "${preferences}"`);
      
      // Parse engagement settings from request if available
      const engagementSettings = req.body.engagementSettings || {};
      if (engagementSettings.enableLikes !== undefined) {
        tunerInstance.enableLikes = engagementSettings.enableLikes;
      }
      if (engagementSettings.enableFollows !== undefined) {
        tunerInstance.enableFollows = engagementSettings.enableFollows;
      }
      if (engagementSettings.enableDislikes !== undefined) {
        tunerInstance.enableDislikes = engagementSettings.enableDislikes;
      }
      
      const startResult = await tunerInstance.start(preferences);
      
      if (startResult) {
        // Mark as active in the session for backup
        req.session.tuningActive = true;
        return res.json({ 
          success: true, 
          message: 'Timeline tuning started using your preferences'
        });
      } else {
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to start timeline tuning' 
        });
      }
    } else {
      // Fallback to legacy approach
      req.session.tuningActive = true;
      console.log('Tuner not initialized, using session-only mode');
      return res.json({ 
        success: true, 
        message: 'Timeline tuning started in legacy mode'
      });
    }
  } catch (error) {
    console.error('Error starting tuning:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error starting tuning: ' + (error.message || 'Unknown error') 
    });
  }
});

app.post('/stop-tuning', (req, res) => {
  try {
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance && tunerInstance.isActive()) {
      console.log('Stopping timeline tuning');
      tunerInstance.stop();
    }
    
    // Always update session state
    req.session.tuningActive = false;
    
    return res.json({ success: true, message: 'Timeline tuning stopped' });
  } catch (error) {
    console.error('Error stopping tuning:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error stopping tuning: ' + (error.message || 'Unknown error')
    });
  }
});

// API endpoint to update tuner settings while running
app.post('/update-tuner-settings', (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.isLoggedIn && !req.session.twitterCookies) {
      return res.status(401).json({ success: false, message: 'Not logged in' });
    }
    
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance) {
      const { enableLikes, enableFollows, enableDislikes } = req.body;
      
      // Update tuner settings
      if (enableLikes !== undefined) {
        tunerInstance.enableLikes = enableLikes;
      }
      
      if (enableFollows !== undefined) {
        tunerInstance.enableFollows = enableFollows;
      }
      
      if (enableDislikes !== undefined) {
        tunerInstance.enableDislikes = enableDislikes;
      }
      
      console.log(`Updated tuner settings: likes=${tunerInstance.enableLikes}, follows=${tunerInstance.enableFollows}, dislikes=${tunerInstance.enableDislikes}`);
      
      return res.json({ 
        success: true, 
        message: 'Tuner settings updated successfully'
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Tuner instance not found' 
      });
    }
  } catch (error) {
    console.error('Error updating tuner settings:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error updating tuner settings: ' + (error.message || 'Unknown error')
    });
  }
});

app.get('/api/analytics', (req, res) => {
  try {
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance) {
      const analyticsData = tunerInstance.getAnalytics();
      
      // Add recent activities if they exist in the tuner
      if (tunerInstance.getRecentActivities) {
        analyticsData.recentActivities = tunerInstance.getRecentActivities();
      } else {
        // No mock data
        analyticsData.recentActivities = [];
      }
      
      // Add interest management data if available
      if (tunerInstance.lastInterestUpdate) {
        analyticsData.interestManagement = {
          timestamp: tunerInstance.lastInterestUpdate,
          totalInterests: tunerInstance.interestData ? tunerInstance.interestData.totalInterests : 0,
          disabledCount: tunerInstance.interestData ? tunerInstance.interestData.disabledCount : 0,
          preferredInterests: tunerInstance.preferredInterests || []
        };
      }
      
      return res.json({ success: true, data: analyticsData });
    } else {
      return res.json({ 
        success: false, 
        message: 'Timeline tuner not initialized',
        data: {
          elapsedMinutes: 0,
          cycles: 0,
          relevancePercentage: 0,
          totalTweetsAnalyzed: 0
        }
      });
    }
  } catch (error) {
    console.error('Error getting analytics:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error getting analytics data',
      error: error.message
    });
  }
});

// API endpoint specifically for activities
app.get('/api/activities', (req, res) => {
  try {
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance && tunerInstance.getRecentActivities) {
      const activities = tunerInstance.getRecentActivities();
      return res.json({ 
        success: true, 
        activities
      });
    } else {
      return res.json({ 
        success: false, 
        message: 'No activity data available',
        activities: []
      });
    }
  } catch (error) {
    console.error('Error getting activity data:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error getting activity data',
      error: error.message,
      activities: []
    });
  }
});

app.get('/logout', (req, res) => {
  // Stop any running tuning
  try {
    const tunerInstance = req.app.locals.tuner;
    if (tunerInstance && tunerInstance.isActive()) {
      tunerInstance.stop();
    }
  } catch (err) {
    console.error('Error stopping tuner during logout:', err);
  }
  
  req.session.destroy();
  res.redirect('/');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});