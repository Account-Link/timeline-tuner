// This is a web worker that runs the timeline tuning process in the background
// It communicates with the main thread to provide updates on the tuning process

class TimelineTunerWorker {
  constructor() {
    this.isRunning = false;
    this.preferences = '';  // Changed from concept to preferences
    this.cookies = [];
    this.progress = 0;
    this.cycleCount = 0;
    this.analytics = {
      startTime: Date.now(),
      elapsedMinutes: 0,
      cycles: 0,
      searches: 0,
      totalTweetsAnalyzed: 0,
      totalRelevantTweets: 0,
      totalIrrelevantTweets: 0,
      totalLiked: 0,
      totalDisliked: 0,
      searchLikes: 0,
      timelineLikes: 0,
      highValueViewings: 0,
      profileVisits: 0,
      profileEngagements: 0,
      relevancePercentage: 0,
      movingAverage: 0,
      convergenceRate: 0,
      relevanceHistory: [],
      topUsers: []
    };
    
    // Activity tracking
    this.recentActivities = [];
    this.activityCounter = 1;
    this.MAX_ACTIVITIES = 30;
    
    // Engagement action toggles
    this.enableLikes = true;     // Whether to like relevant content
    this.enableFollows = true;   // Whether to follow users with relevant content
    this.enableDislikes = true;  // Whether to provide negative feedback
    
    // Interest management tracking
    this.lastInterestUpdate = null;
    this.interestData = {
      totalInterests: 0,
      disabledCount: 0
    };
    this.preferredInterests = [];
  }

  start(cookies, preferences) {
    if (this.isRunning) {
      return { success: false, message: 'Tuner is already running' };
    }

    this.cookies = cookies;
    this.preferences = preferences;
    this.isRunning = true;
    this.progress = 0;
    this.cycleCount = 0;
    
    // Reset analytics
    this.resetAnalytics();
    
    // In a real implementation, this would initialize the tuning process
    // and potentially setup a WebSocket connection to the server for real-time updates
    
    // Simulate starting the process
    this._simulateProgress();
    
    return { 
      success: true, 
      message: `Timeline tuning started for preferences: ${preferences}`
    };
  }

  stop() {
    if (!this.isRunning) {
      return { success: false, message: 'Tuner is not running' };
    }
    
    this.isRunning = false;
    clearTimeout(this._progressTimer);
    
    return { 
      success: true, 
      message: 'Timeline tuning stopped',
      analytics: this.analytics
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      preferences: this.preferences,
      progress: this.progress,
      analytics: this.analytics,
      recentActivities: this.recentActivities
    };
  }

  // Reset analytics for a new tuning session
  resetAnalytics() {
    this.analytics = {
      startTime: Date.now(),
      elapsedMinutes: 0,
      cycles: 0,
      searches: 0,
      totalTweetsAnalyzed: 0,
      totalRelevantTweets: 0,
      totalIrrelevantTweets: 0,
      totalLiked: 0,
      totalDisliked: 0,
      searchLikes: 0,
      timelineLikes: 0,
      highValueViewings: 0,
      profileVisits: 0,
      profileEngagements: 0,
      relevancePercentage: 0,
      movingAverage: 0,
      convergenceRate: 0,
      relevanceHistory: [],
      topUsers: []
    };
    this.recentActivities = [];
    this.activityCounter = 1;
  }

  // Simulate the tuning process (in a real implementation, this would interact with the backend)
  _simulateProgress() {
    if (!this.isRunning) return;
    
    this.progress += 1;
    this.cycleCount += 1;
    this.analytics.cycles = this.cycleCount;
    
    // Simulate improving analytics with each cycle
    if (this.progress % 1 === 0) {
      // Update elapsed time
      this.analytics.elapsedMinutes = ((Date.now() - this.analytics.startTime) / 1000 / 60).toFixed(1);
      
      // Simulate tweet analysis
      const tweetsAnalyzedThisCycle = Math.floor(Math.random() * 15) + 10;
      const relevantTweetsThisCycle = Math.floor((Math.random() * 0.6 + 0.2) * tweetsAnalyzedThisCycle);
      
      this.analytics.totalTweetsAnalyzed += tweetsAnalyzedThisCycle;
      this.analytics.totalRelevantTweets += relevantTweetsThisCycle;
      this.analytics.totalIrrelevantTweets += (tweetsAnalyzedThisCycle - relevantTweetsThisCycle);
      
      // Simulate engagement actions based on settings
      if (this.enableLikes) {
        const likesThisCycle = Math.floor(relevantTweetsThisCycle * 0.8);
        this.analytics.totalLiked += likesThisCycle;
        this.analytics.timelineLikes += likesThisCycle;
        
        // Generate like activities
        for (let i = 0; i < likesThisCycle; i++) {
          if (Math.random() > 0.7) {
            this.trackLikeActivity(
              `user${Math.floor(Math.random() * 1000)}`, 
              `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              `Sample tweet about ${this.preferences}`
            );
          }
        }
      }
      
      if (this.enableDislikes) {
        const dislikesThisCycle = Math.floor((tweetsAnalyzedThisCycle - relevantTweetsThisCycle) * 0.5);
        this.analytics.totalDisliked += dislikesThisCycle;
        
        // Generate dislike activities
        for (let i = 0; i < dislikesThisCycle; i++) {
          if (Math.random() > 0.7) {
            this.trackDislikeActivity(
              `user${Math.floor(Math.random() * 1000)}`,
              `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            );
          }
        }
      }
      
      // Simulate high-value viewings
      const highValueViewingsThisCycle = Math.floor(Math.random() * 2);
      this.analytics.highValueViewings += highValueViewingsThisCycle;
      
      // Generate view activities
      for (let i = 0; i < highValueViewingsThisCycle; i++) {
        this.trackViewActivity(
          `user${Math.floor(Math.random() * 1000)}`,
          `tweet-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          120 + Math.floor(Math.random() * 60)
        );
      }
      
      // Simulate profile visits
      const profileVisitsThisCycle = Math.floor(Math.random() * 2);
      this.analytics.profileVisits += profileVisitsThisCycle;
      
      // Generate profile visit activities
      for (let i = 0; i < profileVisitsThisCycle; i++) {
        this.trackProfileActivity(`user${Math.floor(Math.random() * 1000)}`);
      }
      
      // Simulate follows if enabled
      if (this.enableFollows && Math.random() > 0.8) {
        this.trackFollowActivity(`user${Math.floor(Math.random() * 1000)}`);
      }
      
      // Simulate interest management occasionally (every 5 cycles)
      if (this.cycleCount % 5 === 0) {
        // Generate preferred interests from preferences
        if (this.preferences) {
          this.generatePreferredInterests();
        }
        
        // Simulate interest management
        const totalInterests = Math.floor(Math.random() * 30) + 30;
        const disabledCount = Math.floor(totalInterests * (Math.random() * 0.2 + 0.1));
        
        // Update interest data
        this.interestData = {
          totalInterests,
          disabledCount
        };
        
        // Update timestamp
        this.lastInterestUpdate = Date.now();
        
        // Create interest activity
        this.trackInterestActivity(disabledCount);
      }
      
      // Calculate relevance percentage for this cycle
      const relevancePercentage = (relevantTweetsThisCycle / tweetsAnalyzedThisCycle) * 100;
      
      // Add a data point to relevance history
      this.analytics.relevanceHistory.push({
        cycle: this.cycleCount,
        timestamp: Date.now(),
        percentage: relevancePercentage,
        relevantCount: relevantTweetsThisCycle,
        totalCount: tweetsAnalyzedThisCycle
      });
      
      // Keep only the last 100 data points
      if (this.analytics.relevanceHistory.length > 100) {
        this.analytics.relevanceHistory.shift();
      }
      
      // Calculate the current moving average (last 5 data points)
      if (this.analytics.relevanceHistory.length > 0) {
        const lastN = Math.min(5, this.analytics.relevanceHistory.length);
        const sum = this.analytics.relevanceHistory
          .slice(-lastN)
          .reduce((acc, point) => acc + point.percentage, 0);
        this.analytics.movingAverage = sum / lastN;
      }
      
      // Calculate convergence rate (change in relevance per cycle)
      if (this.analytics.relevanceHistory.length >= 2) {
        const first = this.analytics.relevanceHistory[0];
        const last = this.analytics.relevanceHistory[this.analytics.relevanceHistory.length - 1];
        const cycleDiff = last.cycle - first.cycle;
        
        if (cycleDiff > 0) {
          this.analytics.convergenceRate = (last.percentage - first.percentage) / cycleDiff;
        }
      }
      
      // Set current relevance percentage
      this.analytics.relevancePercentage = this.analytics.relevanceHistory.length > 0 
        ? this.analytics.relevanceHistory[this.analytics.relevanceHistory.length - 1].percentage 
        : 0;
      
      // Simulate top users
      this.analytics.topUsers = [
        { username: `top_user_1`, count: 5 + Math.floor(Math.random() * 5) },
        { username: `top_user_2`, count: 3 + Math.floor(Math.random() * 3) },
        { username: `top_user_3`, count: 1 + Math.floor(Math.random() * 3) }
      ];
      
      // Increment search count occasionally
      if (this.cycleCount % 3 === 0) {
        this.analytics.searches += 1;
        this.analytics.searchLikes += Math.floor(Math.random() * 5) + 1;
      }
    }
    
    // Continue the simulation at a realistic pace
    this._progressTimer = setTimeout(() => this._simulateProgress(), 5000);
  }
  
  // Activity tracking methods
  
  // Track a view activity
  trackViewActivity(username, tweetId, duration) {
    const activity = {
      id: this.activityCounter++,
      type: 'view',
      username,
      tweetId,
      duration,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Track a like activity
  trackLikeActivity(username, tweetId, content = '') {
    const activity = {
      id: this.activityCounter++,
      type: 'like',
      username,
      tweetId,
      content,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Track a follow activity
  trackFollowActivity(username) {
    const activity = {
      id: this.activityCounter++,
      type: 'follow',
      username,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Track a dislike activity
  trackDislikeActivity(username, tweetId) {
    const activity = {
      id: this.activityCounter++,
      type: 'dislike',
      username,
      tweetId,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Track a profile visit activity
  trackProfileActivity(username) {
    const activity = {
      id: this.activityCounter++,
      type: 'profile',
      username,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Track interest management activity
  trackInterestActivity(disabledCount) {
    const activity = {
      id: this.activityCounter++,
      type: 'interests',
      disabledCount,
      timestamp: new Date().toISOString()
    };
    
    this.addActivity(activity);
    return activity;
  }
  
  // Add activity to the list and maintain max size
  addActivity(activity) {
    // Add to the beginning (most recent first)
    this.recentActivities.unshift(activity);
    
    // Keep list size under the maximum
    if (this.recentActivities.length > this.MAX_ACTIVITIES) {
      this.recentActivities.pop();
    }
    
    return activity;
  }
  
  // Get recent activities
  getRecentActivities() {
    return this.recentActivities;
  }
  
  // Generate preferred interests from preferences
  generatePreferredInterests() {
    if (!this.preferences) return [];
    
    // Split preferences string if it contains commas
    const preferencesArray = this.preferences.includes(',') ? 
      this.preferences.split(',').map(p => p.trim()) : [this.preferences];
    
    // Generate variations of preferences as interests
    const interests = [];
    
    preferencesArray.forEach(preference => {
      // Skip negative preferences (those starting with "less" or "no")
      if (preference.toLowerCase().startsWith('less') || 
          preference.toLowerCase().startsWith('no')) {
        return;
      }
      
      // Remove "more" prefix if present
      const cleanPreference = preference.replace(/^more\s+/i, '').trim();
      
      // Add basic preference
      interests.push(cleanPreference);
      
      // Add hashtag version (for topics with spaces)
      if (cleanPreference.includes(' ')) {
        interests.push(`#${cleanPreference.replace(/\s+/g, '')}`);
      }
      
      // Add related terms for common topics
      const lowerPreference = cleanPreference.toLowerCase();
      if (lowerPreference === 'crypto' || lowerPreference === 'cryptocurrency') {
        interests.push('Bitcoin', 'Ethereum', 'Web3');
      } else if (lowerPreference === 'ai' || lowerPreference === 'artificial intelligence') {
        interests.push('Machine Learning', 'Deep Learning', 'ChatGPT');
      }
    });
    
    // Set preferred interests (deduplicated)
    this.preferredInterests = [...new Set(interests)];
    return this.preferredInterests;
  }
}

// Export for use in the main thread
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimelineTunerWorker;
}