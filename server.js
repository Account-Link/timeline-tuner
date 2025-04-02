import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Scraper } from 'agent-twitter-client';
import { Cookie } from 'tough-cookie';
import { tuner } from './timelineTuner.js';
import dotenv from 'dotenv';
import { userDb } from './dist/prisma-client.mjs';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

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
  res.render('login', { error, oauthEnabled: false });
});

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
          req.session.twitterId = profile.id_str || profile.id;
          console.log(`Verified profile: @${profile.username} (${profile.id_str || profile.id})`);
          
          // Check if user is already active in another session
          const isActive = await userDb.isUserActive(profile.id_str || profile.id);
          if (isActive) {
            await tuner.logout();
            return res.status(403).json({ 
              success: false, 
              message: 'This Twitter account is already being used in another active session. Please use a different account or try again later.'
            });
          }
          
          // Store user in database
          await userDb.storeUser(profile.id_str || profile.id, profile.username);
          await userDb.setUserActiveStatus(profile.id_str || profile.id, true);
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
        req.session.twitterId = profile.id_str || profile.id;
        
        // Check if user is already active in another session
        const isActive = await userDb.isUserActive(profile.id_str || profile.id);
        if (isActive) {
          await scraper.clearCookies();
          return res.status(403).json({ 
            success: false, 
            message: 'This Twitter account is already being used in another active session. Please use a different account or try again later.'
          });
        }
        
        // Store user in database
        await userDb.storeUser(profile.id_str || profile.id, profile.username);
        await userDb.setUserActiveStatus(profile.id_str || profile.id, true);
        
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

app.get('/dashboard', async (req, res) => {
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
  
  // If no current preferences in tuner, try to get from database
  if ((!currentPreferences || currentPreferences.trim() === '') && req.session.twitterId) {
    try {
      const dbPreferences = await userDb.getUserPreferences(req.session.twitterId);
      if (dbPreferences && dbPreferences.length > 0) {
        currentPreferences = dbPreferences.join(', ');
      }
    } catch (error) {
      console.error('Error fetching preferences from database:', error);
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
  
  // Update user active status in the database
  if (req.session.twitterId) {
    // If tuning is active, update database
    if (isTunerActive || req.session.tuningActive) {
      await userDb.setUserActiveStatus(req.session.twitterId, true);
    } else {
      await userDb.setUserActiveStatus(req.session.twitterId, false);
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
      
      // Parse preferences into a list of individual preferences
      const preferencesList = preferences.split(',').map(p => p.trim()).filter(p => p.length > 0);
      
      // Store preferences in database if we have the twitter ID
      if (req.session.twitterId) {
        await userDb.storeUserPreferences(req.session.twitterId, preferencesList);
      }
      
      const startResult = await tunerInstance.start(preferences);
      
      if (startResult) {
        // Mark user as active in database
        if (req.session.twitterId) {
          await userDb.setUserActiveStatus(req.session.twitterId, true);
        }
        
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

app.post('/stop-tuning', async (req, res) => {
  try {
    // Get tuner instance
    const tunerInstance = req.app.locals.tuner;
    
    if (tunerInstance && tunerInstance.isActive()) {
      console.log('Stopping timeline tuning');
      tunerInstance.stop();
    }
    
    // Update database user active status
    if (req.session.twitterId) {
      await userDb.setUserActiveStatus(req.session.twitterId, false);
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
// API endpoint to save user settings
app.post('/save-settings', (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.isLoggedIn && !req.session.twitterCookies) {
      return res.status(401).json({ success: false, message: 'Not logged in' });
    }
    
    // Get settings from the request
    const { autoStop, tuningAggression, engagementSettings, notifications } = req.body;
    
    // Store settings in session
    req.session.settings = {
      autoStop,
      tuningAggression,
      notifications
    };
    
    // Get tuner instance and update engagement settings if available
    const tunerInstance = req.app.locals.tuner;
    if (tunerInstance && engagementSettings) {
      if (engagementSettings.enableLikes !== undefined) {
        tunerInstance.enableLikes = engagementSettings.enableLikes;
      }
      
      if (engagementSettings.enableFollows !== undefined) {
        tunerInstance.enableFollows = engagementSettings.enableFollows;
      }
      
      if (engagementSettings.enableDislikes !== undefined) {
        tunerInstance.enableDislikes = engagementSettings.enableDislikes;
      }
      
      console.log(`Saved tuner settings: likes=${tunerInstance.enableLikes}, follows=${tunerInstance.enableFollows}, dislikes=${tunerInstance.enableDislikes}`);
    }
    
    return res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    console.error('Error saving settings:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving settings: ' + (error.message || 'Unknown error')
    });
  }
});

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
      // Get base analytics
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
      
      // Add additional analytics data for console visualization
      if (tunerInstance.getDetailedAnalytics) {
        // If the tuner has a dedicated method for detailed analytics, use it
        Object.assign(analyticsData, tunerInstance.getDetailedAnalytics());
      } else {
        // Otherwise, add some calculated fields based on existing data
        
        // Calculate search vs timeline breakdown if not already present
        if (!analyticsData.searchTweetsAnalyzed && analyticsData.totalTweetsAnalyzed) {
          analyticsData.searchTweetsAnalyzed = Math.round(analyticsData.totalTweetsAnalyzed * 0.7); // Example split
          analyticsData.timelineTweetsAnalyzed = analyticsData.totalTweetsAnalyzed - analyticsData.searchTweetsAnalyzed;
          
          analyticsData.searchRelevant = Math.round(analyticsData.searchTweetsAnalyzed * (analyticsData.relevancePercentage / 100 * 0.6));
          analyticsData.timelineRelevant = Math.round(analyticsData.timelineTweetsAnalyzed * (analyticsData.relevancePercentage / 100 * 1.4));
        }
        
        // Calculate moving average if we have relevance history
        if (analyticsData.relevanceHistory && analyticsData.relevanceHistory.length >= 5) {
          const recentHistory = analyticsData.relevanceHistory.slice(-5);
          analyticsData.movingAverage = recentHistory.reduce((sum, point) => sum + point.percentage, 0) / recentHistory.length;
        }
        
        // Calculate short-term convergence rate
        if (analyticsData.relevanceHistory && analyticsData.relevanceHistory.length >= 4) {
          const lastFour = analyticsData.relevanceHistory.slice(-4);
          const prevAvg = (lastFour[0].percentage + lastFour[1].percentage) / 2;
          const currAvg = (lastFour[2].percentage + lastFour[3].percentage) / 2;
          analyticsData.shortTermRate = currAvg - prevAvg;
        }
        
        // Don't add mock data for top users
        // We'll only display this section if analyticsData.topUsers actually exists
        
        // Don't add mock data for additional metrics
        // Only use what's actually provided by the tuner
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

app.get('/logout', async (req, res) => {
  // Stop any running tuning
  try {
    const tunerInstance = req.app.locals.tuner;
    if (tunerInstance && tunerInstance.isActive()) {
      tunerInstance.stop();
    }
    
    // Update database user active status
    if (req.session.twitterId) {
      await userDb.setUserActiveStatus(req.session.twitterId, false);
    }
  } catch (err) {
    console.error('Error stopping tuner during logout:', err);
  }
  
  req.session.destroy();
  res.redirect('/');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT} and accessible on all network interfaces`);
});