import { Scraper } from 'agent-twitter-client';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { SearchMode } from 'agent-twitter-client';
dotenv.config();

// API key for Hyperbolic API
const HYPERBOLIC_API_KEY = process.env.HYPERBOLIC_API_KEY;
const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz/v1/chat/completions';

// Analytics object to track convergence
export const analytics = {
  startTime: Date.now(),
  cycles: 0,
  searches: 0,
  totalTweetsAnalyzed: 0,
  totalRelevantTweets: 0,
  totalIrrelevantTweets: 0,
  totalLiked: 0,
  totalDisliked: 0,
  
  // Search-specific metrics
  searchLikes: 0,
  searchTweetsAnalyzed: 0,
  
  // Timeline-specific metrics
  timelineLikes: 0,
  timelineTweetsAnalyzed: 0,
  
  // Tweet viewing metrics
  totalTimeSpentViewing: 0,
  highValueViewings: 0,
  
  // Profile visits and engagement
  profileVisits: 0,
  profileEngagements: 0,
  
  // Feedback action success rates
  dontLikeAttempts: 0,
  dontLikeSuccesses: 0,
  notRelevantAttempts: 0,
  notRelevantSuccesses: 0,
  
  // Convergence tracking (percentage of relevant tweets in timeline)
  relevanceHistory: [],
  
  // Add a data point for timeline relevance
  addRelevanceDataPoint(relevantCount, totalCount) {
    if (totalCount === 0) return;
    
    const percentage = (relevantCount / totalCount) * 100;
    this.relevanceHistory.push({
      cycle: this.cycles,
      timestamp: Date.now(),
      percentage,
      relevantCount,
      totalCount
    });
    
    // Keep only the last 100 data points
    if (this.relevanceHistory.length > 100) {
      this.relevanceHistory.shift();
    }
  },
  
  // Calculate the current moving average of relevance (last 5 data points)
  getMovingAverage() {
    if (this.relevanceHistory.length === 0) return 0;
    
    const lastN = Math.min(5, this.relevanceHistory.length);
    const sum = this.relevanceHistory
      .slice(-lastN)
      .reduce((acc, point) => acc + point.percentage, 0);
      
    return sum / lastN;
  },
  
  // Calculate convergence rate (change in relevance per cycle)
  getConvergenceRate() {
    if (this.relevanceHistory.length < 2) return 0;
    
    const first = this.relevanceHistory[0];
    const last = this.relevanceHistory[this.relevanceHistory.length - 1];
    const cycleDiff = last.cycle - first.cycle;
    
    if (cycleDiff === 0) return 0;
    
    return (last.percentage - first.percentage) / cycleDiff;
  },
  
  // Calculate elapsed time in minutes
  getElapsedMinutes() {
    return ((Date.now() - this.startTime) / 1000 / 60).toFixed(1);
  },
  
  // Get relevant tweet percentage for current timeline
  getCurrentRelevancePercentage() {
    if (this.relevanceHistory.length === 0) return 0;
    return this.relevanceHistory[this.relevanceHistory.length - 1].percentage;
  },
  
  // Pretty print analytics
  printAnalytics() {
    const elapsedMin = this.getElapsedMinutes();
    const relevantPct = this.getCurrentRelevancePercentage().toFixed(1);
    const movingAvg = this.getMovingAverage().toFixed(1);
    const convergenceRate = this.getConvergenceRate().toFixed(2);
    
    // Calculate success rates
    const dontLikeRate = this.dontLikeAttempts > 0 
      ? ((this.dontLikeSuccesses / this.dontLikeAttempts) * 100).toFixed(1) 
      : '0.0';
    
    const notRelevantRate = this.notRelevantAttempts > 0 
      ? ((this.notRelevantSuccesses / this.notRelevantAttempts) * 100).toFixed(1) 
      : '0.0';
      
    // Create a horizontal bar for relevance percentage visualization
    const barLength = 30;
    const filledChars = Math.round((this.getCurrentRelevancePercentage() / 100) * barLength);
    const relevanceBar = '█'.repeat(filledChars) + '░'.repeat(barLength - filledChars);
    
    console.log('\n' + '═'.repeat(70));
    console.log(`📊 CONVERGENCE ANALYTICS (${elapsedMin} minutes elapsed)`);
    console.log('═'.repeat(70));
    
    // Overview section
    console.log(`📈 OVERVIEW:`);
    console.log(`   Cycles completed: ${this.cycles} | Searches performed: ${this.searches}`);
    console.log(`   Total tweets analyzed: ${this.totalTweetsAnalyzed} (${this.searchTweetsAnalyzed} search, ${this.timelineTweetsAnalyzed} timeline)`);
    console.log(`   Total interactions: ${this.totalLiked + this.totalDisliked} (${this.totalLiked} likes, ${this.totalDisliked} dislikes)`);
    
    // Enhanced engagement metrics
    console.log(`   In-depth engagement: ${this.highValueViewings} tweets viewed 2+ minutes | ${this.profileVisits} profile visits`);
    
    // Convergence metrics section
    console.log(`\n🎯 TIMELINE CONVERGENCE METRICS:`);
    console.log(`   Current home timeline relevance: ${relevanceBar} ${relevantPct}%`);
    console.log(`   5-cycle moving average: ${movingAvg}%`);
    console.log(`   Convergence rate: ${convergenceRate}% per cycle`);
    
    // Breakdown by source
    console.log(`\n🔍 ENGAGEMENT BREAKDOWN:`);
    const searchRelevantPct = this.searchTweetsAnalyzed > 0 
      ? ((this.searchLikes / this.searchTweetsAnalyzed) * 100).toFixed(1) 
      : '0.0';
      
    const timelineRelevantPct = this.timelineTweetsAnalyzed > 0 
      ? ((this.timelineLikes / this.timelineTweetsAnalyzed) * 100).toFixed(1) 
      : '0.0';
      
    console.log(`   Search: ${this.searchLikes}/${this.searchTweetsAnalyzed} relevant (${searchRelevantPct}%)`);
    console.log(`   Timeline: ${this.timelineLikes}/${this.timelineTweetsAnalyzed} relevant (${timelineRelevantPct}%)`);
    
    // Feedback success rates
    console.log(`\n🛠️ FEEDBACK ACTION SUCCESS RATES:`);
    console.log(`   DontLike: ${this.dontLikeSuccesses}/${this.dontLikeAttempts} (${dontLikeRate}%)`);
    console.log(`   NotRelevant: ${this.notRelevantSuccesses}/${this.notRelevantAttempts} (${notRelevantRate}%)`);
    
    // Timeline to show historical progression
    if (this.relevanceHistory.length > 1) {
      console.log(`\n📅 HOME TIMELINE RELEVANCE HISTORY (last 5 cycles):`);
      const lastFive = this.relevanceHistory.slice(-5);
      lastFive.forEach(point => {
        const cycleBar = '▓'.repeat(Math.round(point.percentage / 10)) + '░'.repeat(10 - Math.round(point.percentage / 10));
        console.log(`   Cycle ${point.cycle}: ${cycleBar} ${point.percentage.toFixed(1)}% (${point.relevantCount}/${point.totalCount})`);
      });
      
      // Add relevance trend graph
      this.printRelevanceTrendGraph();
    }
    
    console.log('═'.repeat(70) + '\n');
  },
  
  // Print a text-based graph showing the relevance trend over time
  printRelevanceTrendGraph() {
    if (this.relevanceHistory.length < 2) return;
    
    console.log(`\n📉 RELEVANCE TREND GRAPH:`);
    
    // Configuration for the graph
    const graphHeight = 10;   // Height of the graph in lines
    const graphWidth = 50;    // Width of the graph in characters
    const maxPoints = Math.min(graphWidth, this.relevanceHistory.length);
    const points = this.relevanceHistory.slice(-maxPoints);
    
    // Find min and max for scaling
    let minPercentage = 100;
    let maxPercentage = 0;
    
    points.forEach(point => {
      minPercentage = Math.min(minPercentage, point.percentage);
      maxPercentage = Math.max(maxPercentage, point.percentage);
    });
    
    // Add some padding to min/max for better visualization
    minPercentage = Math.max(0, minPercentage - 5);
    maxPercentage = Math.min(100, maxPercentage + 5);
    
    // Ensure we have a reasonable range
    if (maxPercentage - minPercentage < 10) {
      minPercentage = Math.max(0, maxPercentage - 10);
    }
    
    // Create the graph
    const range = maxPercentage - minPercentage;
    const normalizedPoints = points.map(point => ({
      cycle: point.cycle,
      value: range === 0 ? 0 : (point.percentage - minPercentage) / range
    }));
    
    // Build the graph lines from top to bottom
    const graph = [];
    
    // Add y-axis labels and grid lines
    for (let i = 0; i < graphHeight; i++) {
      const percentage = maxPercentage - (i * (range / (graphHeight - 1)));
      const label = percentage.toFixed(0).padStart(3) + '%|';
      
      // Calculate the line content
      let line = label;
      
      for (let j = 0; j < normalizedPoints.length; j++) {
        const point = normalizedPoints[j];
        const pointHeight = point.value * (graphHeight - 1);
        const gridLineChar = (i === graphHeight - 1) ? '─' : ' ';
        
        // Determine if the point should be plotted at this line
        const linePosition = graphHeight - 1 - i;
        
        if (Math.round(pointHeight) === linePosition) {
          line += '●';  // Point marker
        } else if (j > 0) {
          const prevPoint = normalizedPoints[j - 1];
          const prevPointHeight = prevPoint.value * (graphHeight - 1);
          
          // Draw connecting line if the point crosses this line
          if ((Math.round(prevPointHeight) <= linePosition && Math.round(pointHeight) >= linePosition) ||
              (Math.round(prevPointHeight) >= linePosition && Math.round(pointHeight) <= linePosition)) {
            line += '│';
          } else {
            line += gridLineChar;
          }
        } else {
          line += gridLineChar;
        }
      }
      
      graph.push(line);
    }
    
    // Add x-axis with cycle numbers
    let xAxis = '    ';  // Align with y-axis labels
    for (let i = 0; i < Math.min(normalizedPoints.length, graphWidth); i += 5) {
      const cycleLabel = points[i].cycle.toString();
      xAxis += cycleLabel.padEnd(5, ' ');
    }
    
    // Print the graph
    graph.forEach(line => console.log(`   ${line}`));
    console.log(`   ${'-'.repeat(4)}${'-'.repeat(normalizedPoints.length)}`);
    console.log(`   ${xAxis}`);
    console.log(`   ${'Cycle →'.padStart(points.length + 5, ' ')}`);
    
    // Print trend analysis
    const firstPoint = points[0].percentage;
    const lastPoint = points[points.length - 1].percentage;
    const trend = lastPoint > firstPoint ? 'upward ↗' : lastPoint < firstPoint ? 'downward ↘' : 'flat →';
    const changePct = ((lastPoint - firstPoint) / firstPoint * 100).toFixed(1);
    
    console.log(`\n   Timeline relevance is trending ${trend} (${changePct}% change over displayed period)`);
  },
  
  // Function to consider following users who post relevant content
  followedUsers: null,
  totalFollowed: 0,
  relevantUserCounts: null,
  printPerformanceInsights: function() {
    if (!this.relevanceHistory || this.relevanceHistory.length < 5) return;
    
    console.log('\n🔮 PERFORMANCE INSIGHTS:');
    
    // Calculate rate of change over different time periods
    const lastPoint = this.relevanceHistory[this.relevanceHistory.length - 1];
    const fiveCyclesAgo = this.relevanceHistory.length >= 5 ? 
      this.relevanceHistory[this.relevanceHistory.length - 5] : null;
      
    if (fiveCyclesAgo) {
      const shortTermRate = (lastPoint.percentage - fiveCyclesAgo.percentage) / 5;
      console.log(`   Short-term convergence rate: ${shortTermRate.toFixed(2)}% per cycle`);
    }
    
    // Most effective strategies
    if (this.searchLikes > 0 && this.timelineLikes > 0) {
      const searchEfficiency = (this.searchLikes / this.searchTweetsAnalyzed) * 100;
      const timelineEfficiency = (this.timelineLikes / this.timelineTweetsAnalyzed) * 100;
      
      console.log(`   Search efficiency: ${searchEfficiency.toFixed(1)}%`);
      console.log(`   Timeline efficiency: ${timelineEfficiency.toFixed(1)}%`);
      
      if (searchEfficiency > timelineEfficiency * 1.2) {
        console.log(`   💡 Strategy: Increase search frequency for faster convergence`);
      } else if (timelineEfficiency > searchEfficiency * 1.2) {
        console.log(`   💡 Strategy: Focus more on timeline processing`);
      }
    }
    
    // Most relevant users info
    if (this.relevantUserCounts) {
      const topUsers = Object.entries(this.relevantUserCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
        
      if (topUsers.length > 0) {
        console.log('\n   Top users posting relevant content:');
        topUsers.forEach(([username, count]) => {
          const followStatus = this.followedUsers && this.followedUsers.has(username) ? '(followed)' : '';
          console.log(`   - @${username}: ${count} relevant tweets ${followStatus}`);
        });
      }
    }
    
    // Adaptive timing recommendation
    const optimalTiming = this.analyzeOptimalTimings();
    if (optimalTiming) {
      console.log(`\n   💡 Recommended refresh delay: ${Math.round(optimalTiming / 1000)} seconds`);
    }
    
    // New engagement strategy insights
    if (this.highValueViewings > 0) {
      console.log(`\n   💡 Deep engagement: ${this.highValueViewings} tweets viewed for 2+ minutes`);
      console.log(`   💡 Profile visits: ${this.profileVisits} with ${this.profileEngagements} engagements`);
    }
  },
  
  // New function to analyze most effective times for updates
  analyzeOptimalTimings: function() {
    if (!this.relevanceHistory || this.relevanceHistory.length < 5) return null;
    
    // Look at the last several data points to find when we had the best performance
    const recentHistory = this.relevanceHistory.slice(-10);
    
    // Calculate deltas between consecutive data points
    const deltas = [];
    for (let i = 1; i < recentHistory.length; i++) {
      const prev = recentHistory[i-1];
      const curr = recentHistory[i];
      
      deltas.push({
        cycleGap: curr.cycle - prev.cycle,
        percentageChange: curr.percentage - prev.percentage,
        timeGap: (curr.timestamp - prev.timestamp) / 1000 / 60, // in minutes
        efficiency: (curr.percentage - prev.percentage) / (curr.cycle - prev.cycle)
      });
    }
    
    // Find the most efficient time gap
    let bestDelta = null;
    let bestEfficiency = -Infinity;
    
    for (const delta of deltas) {
      if (delta.efficiency > bestEfficiency) {
        bestEfficiency = delta.efficiency;
        bestDelta = delta;
      }
    }
    
    if (bestDelta) {
      const optimalTimeGap = Math.max(30, Math.min(300, Math.round(bestDelta.timeGap * 60))); // in seconds
      return optimalTimeGap;
    }
    
    return null;
  },

  // Function to get current analytics as an object for display
  getAnalyticsData() {
    return {
      elapsedMinutes: this.getElapsedMinutes(),
      cycles: this.cycles,
      searches: this.searches,
      totalTweetsAnalyzed: this.totalTweetsAnalyzed,
      totalRelevantTweets: this.totalRelevantTweets,
      totalIrrelevantTweets: this.totalIrrelevantTweets,
      totalLiked: this.totalLiked,
      totalDisliked: this.totalDisliked,
      searchLikes: this.searchLikes,
      timelineLikes: this.timelineLikes,
      highValueViewings: this.highValueViewings,
      profileVisits: this.profileVisits,
      profileEngagements: this.profileEngagements,
      relevancePercentage: this.getCurrentRelevancePercentage(),
      movingAverage: this.getMovingAverage(),
      convergenceRate: this.getConvergenceRate(),
      relevanceHistory: this.relevanceHistory,
      topUsers: this.relevantUserCounts ? 
        Object.entries(this.relevantUserCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([username, count]) => ({ username, count })) : 
        []
    };
  },

  // Reset analytics for a new tuning session
  reset() {
    this.startTime = Date.now();
    this.cycles = 0;
    this.searches = 0;
    this.totalTweetsAnalyzed = 0;
    this.totalRelevantTweets = 0;
    this.totalIrrelevantTweets = 0;
    this.totalLiked = 0;
    this.totalDisliked = 0;
    this.searchLikes = 0;
    this.searchTweetsAnalyzed = 0;
    this.timelineLikes = 0;
    this.timelineTweetsAnalyzed = 0;
    this.totalTimeSpentViewing = 0;
    this.highValueViewings = 0;
    this.profileVisits = 0;
    this.profileEngagements = 0;
    this.dontLikeAttempts = 0;
    this.dontLikeSuccesses = 0;
    this.notRelevantAttempts = 0;
    this.notRelevantSuccesses = 0;
    this.relevanceHistory = [];
    this.followedUsers = null;
    this.totalFollowed = 0;
    this.relevantUserCounts = null;
  }
};

// LLM-based function to check if text is related to a concept using Hyperbolic API
export async function isRelatedToConcept(text, concepts) {
  // Fallback to simple keyword matching if text is too short or API key is missing
  if (!text || !HYPERBOLIC_API_KEY) {
    return false;
  }
  
  // Convert single concept string to an array for unified processing
  const conceptArray = Array.isArray(concepts) ? concepts : [concepts];
  const conceptText = conceptArray.join(', ');
  
  try {
    // Prepare the message for the LLM with enhanced preference parsing
    const promptText = `
    Determine if the following tweet text adheres to my preferences of what content I want to see.
    
    My preferences: "${conceptText}"
    
    Note: My preferences may include both what I want to see MORE of and what I want to see LESS of.
    For example, if I said "More Machine Learning, Less Crypto", then show me Machine Learning content and avoid Crypto content.
    
    Text: "${text.replace(/"/g, '\\"')}"
    
    Respond with ONLY "yes" or "no".
    `;
    
    // Call the Hyperbolic API with the proper request format
    const response = await fetch(HYPERBOLIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HYPERBOLIC_API_KEY}`
      },
      body: JSON.stringify({
        model: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
        messages: [
          {
            role: 'user',
            content: promptText
          }
        ],
        max_tokens: 10,
        temperature: 0.1,  // Low temperature for deterministic responses
        top_p: 0.95,
        stream: false
      })
    });

    if (!response.ok) {
      console.error(`API error: ${response.status} ${response.statusText}`);
      return false;
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content.trim().toLowerCase() || '';
    
    console.log(`LLM judgment for concepts "${conceptText}": ${answer}`);
    return answer.includes('yes');
    
  } catch (error) {
    console.error('Error calling Hyperbolic API:', error.message);
    // Fallback to the simple keyword-based method if the API call fails
    return false;
  }
}

// Helper function to delay execution
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// New function to stay on tweet to signal interest (high weight in Twitter algorithm)
export async function stayOnTweet(scraper, tweetId, seconds, tunerInstance = null) {
  try {
    // Log the start of viewing activity
    console.log(`🕰️ Starting to view tweet ${tweetId} for ${seconds} seconds`);
    
    // Record tweet view start time
    const startTime = Date.now();
    
    // For API-based approach, we simulate staying on a tweet
    // Fetch the tweet to ensure it's loaded and cached
    const tweetData = await scraper.getTweet(tweetId);
    const username = tweetData?.user?.screen_name || tweetData?.core?.user_results?.result?.legacy?.screen_name || 'unknown';
    
    // Wait for the specified duration 
    await sleep(seconds * 1000);
    
    // Record analytics
    const actualDuration = (Date.now() - startTime) / 1000;
    analytics.totalTimeSpentViewing += actualDuration;
    
    // Twitter's algorithm specifically values staying for 2+ minutes
    if (seconds >= 120) {
      analytics.highValueViewings++;
      console.log(`✓ Completed high-value view of tweet by @${username} (${seconds} seconds)`);
    } else {
      console.log(`✓ Viewed tweet by @${username} for ${seconds} seconds`);
    }
    
    // Track activity if tuner instance is provided
    if (tunerInstance && typeof tunerInstance.trackViewActivity === 'function') {
      tunerInstance.trackViewActivity(username, tweetId, seconds);
    }
    
    return true;
  } catch (error) {
    console.error(`Error during tweet viewing: ${error.message}`);
    return false;
  }
}

// New function to visit user profiles and engage with their content
export async function visitProfileAndEngage(scraper, username, concept, tunerInstance = null) {
  const engagementSummary = {
    profileVisited: false,
    tweetsLiked: 0,
    conceptTweetsFound: 0,
    conceptTweetsEngaged: 0
  };
  
  try {
    console.log(`\n👤 Visiting profile for user: @${username}`);
    analytics.profileVisits++;
    
    // Track profile visit activity if tuner instance is provided
    if (tunerInstance && typeof tunerInstance.trackProfileActivity === 'function') {
      tunerInstance.trackProfileActivity(username);
    }
    
    // Get user's recent tweets using the API
    const userId = await scraper.getUserIdByScreenName(username);
    let recentTweets = [];
    
    try {
      // Collect tweets using the iterator
      const tweetsIterator = scraper.getUserTweetsIterator(userId, 20);
      for await (const tweet of tweetsIterator) {
        recentTweets.push(tweet);
        if (recentTweets.length >= 20) break;
      }
      engagementSummary.profileVisited = true;
    } catch (error) {
      console.error(`Error fetching tweets for @${username}: ${error.message}`);
      return engagementSummary;
    }
    
    // Find concept-related tweets from this author
    const conceptTweets = [];
    
    for (const tweet of recentTweets) {
      const tweetText = tweet.full_text || tweet.text || '';
      const tweetId = tweet.id_str || tweet.id || tweet.rest_id;
      
      if (!tweetId) continue;
      
      const isRelevant = await isRelatedToConcept(tweetText, concept);
      
      if (isRelevant) {
        conceptTweets.push({
          tweet,
          tweetId,
          text: tweetText
        });
        engagementSummary.conceptTweetsFound++;
      }
    }
    
    // Engage with 1-3 concept-related tweets if found
    if (conceptTweets.length > 0) {
      // Sort by recency (most recent first)
      conceptTweets.sort((a, b) => {
        const dateA = new Date(a.tweet.created_at);
        const dateB = new Date(b.tweet.created_at);
        return dateB - dateA;
      });
      
      // Take up to 3 most recent
      const engageCount = Math.min(3, conceptTweets.length);
      
      for (let i = 0; i < engageCount; i++) {
        const { tweetId, text } = conceptTweets[i];
        
        // Check if likes are enabled from settings
        const likesEnabled = tunerInstance?.enableLikes !== false;
        
        // View the tweet regardless
        if (i === 0) {
          await stayOnTweet(scraper, tweetId, 60);
        }
        
        // Like the tweet if likes are enabled and not already liked
        if (likesEnabled) {
          try {
            await scraper.likeTweet(tweetId);
            engagementSummary.tweetsLiked++;
            engagementSummary.conceptTweetsEngaged++;
            console.log(`✓ Liked tweet from profile: ${text.substring(0, 50)}...`);
            analytics.profileEngagements++;
            
            // Track like activity if tuner instance is provided
            if (tunerInstance && typeof tunerInstance.trackLikeActivity === 'function') {
              tunerInstance.trackLikeActivity(username, tweetId, text.substring(0, 100));
            }
          } catch (error) {
            console.error(`Error liking tweet ${tweetId}: ${error.message}`);
          }
        } else {
          console.log(`ℹ️ Viewed but did not like tweet from profile (likes disabled in settings)`);
          // Still count engagement (view-only)
          engagementSummary.conceptTweetsEngaged++;
        }
        
        await sleep(2000); // Space out engagements
      }
    } 
    // If no concept tweets found but we want to strengthen connection to this author
    // who has been relevant in the past, like 1 recent tweet
    else if (analytics.relevantUserCounts && 
             analytics.relevantUserCounts[username] && 
             recentTweets.length > 0) {
      
      try {
        const recentTweet = recentTweets[0];
        const tweetId = recentTweet.id_str || recentTweet.id || recentTweet.rest_id;
        
        if (tweetId) {
          await scraper.likeTweet(tweetId);
          engagementSummary.tweetsLiked++;
          console.log(`✓ Liked recent tweet from profile (building relationship)`);
          analytics.profileEngagements++;
        }
      } catch (error) {
        console.error(`Error liking tweet: ${error.message}`);
      }
    }
    
    // Spend some time on the profile (important for algorithm)
    await sleep(15000); // 15 seconds on profile
    
    console.log(`✓ Profile visit complete: Found ${engagementSummary.conceptTweetsFound} concept tweets, engaged with ${engagementSummary.conceptTweetsEngaged}`);
    return engagementSummary;
    
  } catch (error) {
    console.error(`Error during profile visit and engagement: ${error.message}`);
    return engagementSummary;
  }
}

// Helper function to find feedback action by type and extract metadata
export function findFeedbackAction(tweetWithFeedback, feedbackType) {
  // Check if there are feedback actions available
  if (!tweetWithFeedback.feedbackActions) return null;
  
  // Check if there's a key with the exact name of the feedback type (lowercase)
  const lowerType = feedbackType.toLowerCase();
  if (tweetWithFeedback.feedbackActions[lowerType]) {
    return tweetWithFeedback.feedbackActions[lowerType];
  }
  
  // Otherwise, check all keys to find one with the matching feedbackType
  for (const key in tweetWithFeedback.feedbackActions) {
    const action = tweetWithFeedback.feedbackActions[key];
    if (action && action.feedbackType === feedbackType) {
      return action;
    }
  }
  
  return null;
}

// Helper function to find "DontLike" feedback action and extract metadata
export function findDontLikeAction(tweetWithFeedback) {
  return findFeedbackAction(tweetWithFeedback, 'DontLike');
}

// Helper function to find "NotRelevant" feedback action and extract metadata
export function findNotRelevantAction(tweetWithFeedback) {
  return findFeedbackAction(tweetWithFeedback, 'NotRelevant');
}

// Helper function to extract action_metadata from a feedbackUrl
export function extractActionMetadata(feedbackUrl) {
  if (!feedbackUrl) return null;
  
  try {
    const url = new URL(`https://twitter.com${feedbackUrl}`);
    return url.searchParams.get('action_metadata');
  } catch (error) {
    console.error(`Error extracting action_metadata: ${error.message}`);
    return null;
  }
}

// Helper function to send feedback with action metadata
export async function sendFeedback(scraper, tweetId, feedbackAction, actionDescription) {
  if (!feedbackAction) return false;
  
  // Extract action_metadata from the feedbackUrl
  const actionMetadata = extractActionMetadata(feedbackAction.feedbackUrl);
  
  if (actionMetadata) {
    try {
      // Track analytics based on feedback type
      if (feedbackAction.feedbackType === 'DontLike') {
        analytics.dontLikeAttempts++;
      } else if (feedbackAction.feedbackType === 'NotRelevant') {
        analytics.notRelevantAttempts++;
      }
      
      // Send feedback using the specific action_metadata
      if (feedbackAction.feedbackType === 'DontLike') {
        await scraper.unlikeTweet(tweetId, actionMetadata);
        analytics.dontLikeSuccesses++;
      } else if (feedbackAction.feedbackType === 'NotRelevant') {
        // Use the API to send NotRelevant feedback
        const notRelevantUrl = `https://twitter.com${feedbackAction.feedbackUrl}`;
        const response = await fetch(notRelevantUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': await scraper.getCookieString()
          },
          body: new URLSearchParams({
            'feedback_type': 'NotRelevant',
            'undo': 'false'
          })
        });
        
        if (!response.ok) {
          console.error(`Error sending ${feedbackAction.feedbackType} feedback: ${response.status} ${response.statusText}`);
          return false;
        }
        
        analytics.notRelevantSuccesses++;
      }
      
      console.log(`✓ ${actionDescription} using specific action metadata`);
      return true;
    } catch (error) {
      console.error(`Error sending ${feedbackAction.feedbackType} feedback:`, error.message);
      return false;
    }
  }
  
  return false;
}

// Function to search for tweets related to the concept and like them
export async function searchAndLikeRelevantTweets(scraper, concept, processedTweets, maxTweets = 30, tunerInstance = null) {
  const conceptDisplay = Array.isArray(concept) ? concept.join(', ') : concept;
  console.log(`\n📡 Searching for tweets related to "${conceptDisplay}"...`);
  analytics.searches++;
  
  try {
    // Create search queries based on preference type
    let searchQueries = [];
    
    // Handle array of preferences or single concept
    if (Array.isArray(concept)) {
      // Extract "more" preferences for searching (we'll filter the results later)
      const positivePreferences = concept.filter(pref => 
        !pref.toLowerCase().startsWith('less') && 
        !pref.toLowerCase().startsWith('no')
      ).map(pref => pref.replace(/^more\s+/i, '').trim());
      
      // Generate search queries for each positive preference
      for (const pref of positivePreferences) {
        const hashtagVersion = pref.replace(/\s+/g, '');
        searchQueries.push(
          { query: `${pref}`, label: `exact: ${pref}` },
          { query: `#${hashtagVersion}`, label: `hashtag: ${pref}` },
          { query: `${pref} filter:links`, label: `${pref} with links` },
          { query: `${pref} min_faves:10`, label: `popular ${pref}` }
        );
      }
    } else {
      // Traditional single concept behavior
      const hashtagVersion = concept.replace(/\s+/g, '');
      searchQueries = [
        { query: `${concept}`, label: "exact concept" },
        { query: `#${hashtagVersion}`, label: "hashtag" },
        { query: `${concept} filter:links`, label: "with links" },
        { query: `${concept} filter:images`, label: "with images" },
        { query: `${concept} filter:videos`, label: "with videos" },
        { query: `${concept} -filter:replies`, label: "excluding replies" },
        { query: `${concept} min_faves:10`, label: "popular tweets" },
        { query: `${concept} lang:en`, label: "English only" },
        { query: `${concept} is:verified`, label: "verified accounts" }
      ];
    }
    
    let totalLikedCount = 0;
    let totalAnalyzedCount = 0;
    
    // Process each search query
    for (const searchItem of searchQueries) {
      if (totalLikedCount >= maxTweets) break;
      
      console.log(`\n🔍 Searching for "${searchItem.label}": ${searchItem.query}`);
      
      // Get search results - use Top ranking for better content
      const searchResultsPage = await scraper.fetchSearchTweets(
        searchItem.query, 
        Math.min(20, maxTweets - totalLikedCount), 
        SearchMode.Top
      );
      
      if (!searchResultsPage || !searchResultsPage.tweets || searchResultsPage.tweets.length === 0) {
        console.log(`No search results found for "${searchItem.query}"`);
        continue;
      }
      
      console.log(`Found ${searchResultsPage.tweets.length} search results for "${searchItem.query}"`);
      
      let likedCount = 0;
      
      // Process each search result
      for (const tweet of searchResultsPage.tweets) {
        const tweetId = tweet.id;
        totalAnalyzedCount++;
        analytics.searchTweetsAnalyzed++;
        analytics.totalTweetsAnalyzed++;
        
        // Skip if we've already processed this tweet
        if (processedTweets.has(tweetId)) {
          continue;
        }
        
        const tweetText = tweet.text || '';
        const username = tweet.username || 'unknown';
        
        // Track usernames that post relevant content
        if (!analytics.relevantUserCounts) {
          analytics.relevantUserCounts = {};
        }
        
        console.log(`\nProcessing search result from @${username}:`);
        console.log(`Content: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '...' : ''}`);
        
        // Assume relevance for search results to optimize processing
        // Only double-check with LLM for longer tweets and if API key is available
        let isRelevant = true;
        
        // If we want to double-check with LLM
        if (HYPERBOLIC_API_KEY && tweetText.length > 40) {
          isRelevant = await isRelatedToConcept(tweetText, concept);
          console.log(`Search result related to ${concept}: ${isRelevant ? 'Yes' : 'No'}`);
        }
        
        if (isRelevant) {
          try {
            analytics.totalRelevantTweets++;
            
            // Check if likes are enabled from settings
            const likesEnabled = tunerInstance?.enableLikes !== false;
            const followsEnabled = tunerInstance?.enableFollows !== false;
            
            let isLiked = false;
            
            // Like tweets if enabled in settings
            if (likesEnabled) {
              await scraper.likeTweet(tweetId);
              console.log(`✓ Liked search result tweet (relevant to preferences)`);
              likedCount++;
              totalLikedCount++;
              analytics.searchLikes++;
              analytics.totalLiked++;
              isLiked = true;
            } else {
              console.log(`ℹ️ Found relevant tweet but did not like (likes disabled in settings)`);
            }
            
            // For every 3rd relevant tweet, spend significant time viewing it (120+ seconds)
            // This is important for the algorithm
            if (likedCount % 3 === 0) {
              await stayOnTweet(scraper, tweetId, 120, tunerInstance);
            } else {
              // Always view tweets we find relevant, even if shorter duration
              await stayOnTweet(scraper, tweetId, 40, tunerInstance);
            }
            
            // Record that we've processed this tweet
            processedTweets.set(tweetId, {
              processed: true,
              liked: isLiked,
              dontLiked: false,
              notRelevant: false,
              fromSearch: true
            });
            
            // Track the user who posted relevant content
            analytics.relevantUserCounts[username] = (analytics.relevantUserCounts[username] || 0) + 1;
            
            // Give higher priority to users who consistently post good content
            const relevanceScore = analytics.relevantUserCounts[username];
            
            // Prioritize engaging with frequent relevant posters
            if (relevanceScore >= 3) {
              // Highly relevant user - always visit their profile
              console.log(`🌟 High-value user @${username} found (${relevanceScore} relevant posts)`);
              await visitProfileAndEngage(scraper, username, concept, tunerInstance);
              
              // Always consider following high-value users if follows are enabled
              if (followsEnabled) {
                await considerFollowingUser(scraper, username, tunerInstance);
              }
            } else if (relevanceScore >= 2 && Math.random() < 0.6) {
              // Medium-value user - visit profile with higher probability
              await visitProfileAndEngage(scraper, username, concept, tunerInstance);
            } else if (relevanceScore === 1 && Math.random() < 0.2) {
              // New user with relevant content - visit occasionally
              await visitProfileAndEngage(scraper, username, concept, tunerInstance);
            } else if (followsEnabled) {
              // Consider following users with any relevant content if follows are enabled
              await considerFollowingUser(scraper, username, tunerInstance);
            }
            
            // Add a short pause between likes to avoid rate limiting
            await sleep(500); // Shorter delay for search results
          } catch (error) {
            console.error(`Error liking search result tweet ${tweetId}:`, error.message);
          }
        } else {
          analytics.totalIrrelevantTweets++;
        }
        
        // Stop if we've processed enough tweets for this search query
        if (likedCount >= 10) {
          break;
        }
      }
      
      console.log(`\n✅ Liked ${likedCount} tweets from "${searchItem.label}" search results`);
      
      // Brief pause between different search queries
      if (likedCount > 0) {
        await sleep(2000);
      }
    }
    
    console.log(`\n📊 Search summary: Liked ${totalLikedCount} tweets across ${searchQueries.length} search queries`);
    return totalLikedCount;
    
  } catch (error) {
    console.error('Error during search and like process:', error.message);
    return 0;
  }
}

// New function to consider following users who post relevant content
export async function considerFollowingUser(scraper, username, tunerInstance = null) {
  if (!analytics.relevantUserCounts || !username) return;
  
  // Check follows settings
  let followsEnabled = true;
  
  // First try to get settings from passed tunerInstance
  if (tunerInstance) {
    followsEnabled = tunerInstance.enableFollows !== false;
  }
  // Fall back to global tuner if available
  else {
    const globalTuner = global.tuner;
    if (globalTuner) {
      followsEnabled = globalTuner.enableFollows !== false;
    }
  }
  
  // If follows are disabled in settings, don't follow
  if (!followsEnabled) {
    console.log(`ℹ️ Not following @${username} (follows disabled in settings)`);
    return false;
  }
  
  // If we're not tracking followed users yet, initialize
  if (!analytics.followedUsers) {
    analytics.followedUsers = new Set();
  }
  
  // If we've seen multiple relevant tweets from this user and haven't followed them yet
  const relevantCount = analytics.relevantUserCounts[username] || 0;
  if (relevantCount >= 2 && !analytics.followedUsers.has(username)) {
    try {
      // Follow the user
      console.log(`🔄 Following @${username} who posts relevant content (${relevantCount} relevant tweets)`);
      await scraper.followUser(username);
      analytics.followedUsers.add(username);
      
      // Track metrics
      if (!analytics.totalFollowed) analytics.totalFollowed = 0;
      analytics.totalFollowed++;
      
      // Track follow activity if tuner instance is provided
      if (tunerInstance && typeof tunerInstance.trackFollowActivity === 'function') {
        tunerInstance.trackFollowActivity(username);
      }
      
      return true;
    } catch (error) {
      console.error(`Error following user ${username}:`, error.message);
    }
  }
  return false;
}

// New function to provide more aggressive feedback
export async function provideAggressiveFeedback(scraper, tweetWithFeedback, tweetId, concept, tunerInstance = null) {
  const tweet = tweetWithFeedback.tweet;
  const tweetText = tweet.legacy?.full_text || '';
  const username = tweet.core?.user_results?.result?.legacy?.screen_name || tweet.user?.screen_name || 'unknown';
  
  // Check dislikes settings
  let dislikesEnabled = true;
  
  // First try to get settings from passed tunerInstance
  if (tunerInstance) {
    dislikesEnabled = tunerInstance.enableDislikes !== false;
  }
  // Fall back to global tuner if available
  else {
    const globalTuner = global.tuner;
    if (globalTuner) {
      dislikesEnabled = globalTuner.enableDislikes !== false;
    }
  }
  
  // If dislikes are disabled in settings, don't provide negative feedback
  if (!dislikesEnabled) {
    console.log(`ℹ️ Not providing negative feedback (dislikes disabled in settings)`);
    return false;
  }
  
  // First apply standard feedback actions
  const dontLikeAction = findDontLikeAction(tweetWithFeedback);
  const notRelevantAction = findNotRelevantAction(tweetWithFeedback);
  
  let feedbackSuccess = false;
  
  // Apply "Don't Like" feedback
  if (dontLikeAction) {
    const actionMetadata = extractActionMetadata(dontLikeAction.feedbackUrl);
    
    if (actionMetadata) {
      analytics.dontLikeAttempts++;
      await scraper.unlikeTweet(tweetId, actionMetadata);
      analytics.dontLikeSuccesses++;
      analytics.totalDisliked++;
      
      console.log('✗ Marked as "Not interested" using specific action metadata');
      feedbackSuccess = true;
      
      // Track dislike activity if tuner instance is provided
      if (tunerInstance && typeof tunerInstance.trackDislikeActivity === 'function') {
        tunerInstance.trackDislikeActivity(username, tweetId);
      }
    }
  }
  
  // Apply "Not Relevant" feedback
  if (notRelevantAction) {
    await sleep(300); // Brief pause between actions
    const notRelevantSuccess = await sendFeedback(
      scraper, 
      tweetId, 
      notRelevantAction, 
      'Marked as "This post isn\'t relevant"'
    );
    
    if (notRelevantSuccess) {
      feedbackSuccess = true;
    }
  }
  
  // Advanced: Try to find "not interested in this topic" or other feedback options
  // This might require extending the tweet scraper capabilities
  
  return feedbackSuccess;
}

// New function to optimize memory usage and tracking
export function optimizeMemoryUsage(processedTweets, maxSize = 1000) {
  if (processedTweets.size <= maxSize) return;
  
  // Keep only the most recent tweets
  const tweets = Array.from(processedTweets.entries());
  processedTweets.clear();
  
  // Keep tweets from the end (most recent)
  tweets.slice(-maxSize).forEach(([id, status]) => processedTweets.set(id, status));
  
  console.log(`🧹 Memory optimized: Reduced processed tweets from ${tweets.length} to ${processedTweets.size}`);
}

// Class to manage the Twitter timeline tuning process
export class TimelineTuner {
  constructor() {
    this.scraper = null;
    this.concept = null;
    this.isRunning = false;
    this.intervalId = null;
    this.processedTweets = new Map();
    this.cycleCount = 0;
    this.refreshDelay = 30000; // 30 seconds between timeline refreshes
    
    // Configuration
    this.INTERACTION_DELAY = 2000; // 2 seconds between likes/dislikes
    this.SEARCH_INTERVAL = 3; // How many home timeline refreshes before doing a search again 
    this.MAX_SEARCH_TWEETS = 40; // Maximum number of search results to process
    this.ANALYTICS_INTERVAL = 1; // How often to print analytics (every N cycles)
    this.TIMELINE_FETCH_COUNT = 100; // Number of tweets to fetch from timeline
    this.ADAPTIVE_TIMING = true; // Whether to use adaptive timing based on performance
    this.PROFILE_VISIT_INTERVAL = 5; // How often to visit profiles (every N cycles)
    
    // Engagement action toggles (controlled by settings)
    this.enableLikes = true;     // Whether to like relevant content
    this.enableFollows = true;   // Whether to follow users with relevant content
    this.enableDislikes = true;  // Whether to provide negative feedback
    
    // Activity tracking
    this.recentActivities = [];
    this.activityCounter = 1;
    this.MAX_ACTIVITIES = 30;   // Maximum number of activities to store
    
    // Event handlers
    this.onStatusChanged = null;
    this.onAnalyticsUpdated = null;
    this.onError = null;
  }

  // Login to Twitter
  async login(username, password, email) {
    try {
      this.scraper = new Scraper();
      await this.scraper.login(username, password, email);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      this.handleError(error);
      return false;
    }
  }

  // Start the tuning process
  async start(concept) {
    if (!this.scraper) {
      const error = new Error('Not logged in. Please login first.');
      this.handleError(error);
      return false;
    }

    if (this.isRunning) {
      this.stop();
    }

    try {
      // Convert concept string to structured preferences if needed
      // This allows handling both simple concepts and more/less preferences
      if (typeof concept === 'string') {
        // Check if concept contains multiple preferences (using commas)
        if (concept.includes(',')) {
          this.concept = concept.split(',').map(pref => pref.trim());
        } else {
          this.concept = concept;
        }
      } else {
        this.concept = concept;
      }
      
      console.log(`Starting tuning with preferences: ${Array.isArray(this.concept) ? this.concept.join(', ') : this.concept}`);
      
      this.isRunning = true;
      this.processedTweets = new Map();
      this.cycleCount = 0;
      this.refreshDelay = 30000;
      
      // Reset analytics
      analytics.reset();
      
      if (this.onStatusChanged) {
        this.onStatusChanged(true, this.concept);
      }
      
      // Initial search to bootstrap the process
      await searchAndLikeRelevantTweets(this.scraper, this.concept, this.processedTweets, this.MAX_SEARCH_TWEETS, this);
      
      // Start continuous monitoring
      this.runTuning();
      
      return true;
    } catch (error) {
      console.error('Error starting tuning:', error);
      this.handleError(error);
      this.stop();
      return false;
    }
  }

  // Stop the tuning process
  stop() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    
    this.isRunning = false;
    
    if (this.onStatusChanged) {
      this.onStatusChanged(false, this.concept);
    }
    
    return true;
  }

  // Run a single tuning cycle
  async runCycle() {
    try {
      this.cycleCount++;
      analytics.cycles++;
      
      // As convergence improves, adjust search frequency
      let searchThisCycle = false;
      
      // Calculate current relevance percentage
      const currentRelevance = analytics.getCurrentRelevancePercentage();
      
      // Dynamic search interval based on current relevance
      // Search more frequently when relevance is low, less frequently when high
      if (currentRelevance < 30) {
        // Low relevance: search every cycle
        searchThisCycle = true;
      } else if (currentRelevance < 60) {
        // Medium relevance: search every other cycle
        searchThisCycle = this.cycleCount % 2 === 0;
      } else {
        // High relevance: use standard interval
        searchThisCycle = this.cycleCount % this.SEARCH_INTERVAL === 0;
      }
      
      // Search for relevant tweets based on dynamic frequency
      if (searchThisCycle) {
        console.log(`\n🔍 Running search at relevance level ${currentRelevance.toFixed(1)}%`);
        await searchAndLikeRelevantTweets(this.scraper, this.concept, this.processedTweets, this.MAX_SEARCH_TWEETS, this);
      }
      
      // Profile visit strategy based on convergence
      if (analytics.relevantUserCounts && Object.keys(analytics.relevantUserCounts).length > 0) {
        // Get top users by relevance count
        const topUsers = Object.entries(analytics.relevantUserCounts)
          .sort((a, b) => b[1] - a[1]);
          
        // Always visit the most relevant user every cycle
        if (topUsers.length > 0) {
          const topUser = topUsers[0];
          console.log(`\n🔝 Visiting top relevant user @${topUser[0]} (${topUser[1]} relevant tweets)`);
          await visitProfileAndEngage(this.scraper, topUser[0], this.concept, this);
        }
        
        // Periodically visit other relevant users
        if (this.cycleCount % this.PROFILE_VISIT_INTERVAL === 0 && topUsers.length > 1) {
          // Get a random user from ranks 2-5
          const secondaryUsers = topUsers.slice(1, Math.min(5, topUsers.length));
          const randomUser = secondaryUsers[Math.floor(Math.random() * secondaryUsers.length)];
          
          console.log(`\n🔄 Selected secondary user @${randomUser[0]} for profile visit (${randomUser[1]} relevant tweets)`);
          await visitProfileAndEngage(this.scraper, randomUser[0], this.concept, this);
        }
      }
      
      // Fetch more tweets from the home timeline
      const homeTimelineWithFeedback = await this.scraper.fetchHomeTimeline(this.TIMELINE_FETCH_COUNT, []);
      console.log(`\nFetched ${homeTimelineWithFeedback.length} tweets from home timeline`);
      
      let processedCount = 0;
      let skippedCount = 0;
      let relevantCount = 0;
      let analyzedCount = 0;
      
      // Process each tweet
      for (const tweetWithFeedback of homeTimelineWithFeedback) {
        const tweet = tweetWithFeedback.tweet;
        const tweetId = tweet.rest_id || tweet.legacy?.id_str;
        if (!tweetId) {
          console.log('Skipping tweet without ID');
          skippedCount++;
          continue;
        }
        
        const tweetText = tweet.legacy?.full_text || '';
        const user = tweet.core?.user_results?.result;
        const username = user?.legacy?.screen_name || 'unknown';
        
        // Check if we've already processed this tweet
        if (this.processedTweets.has(tweetId)) {
          continue; // Skip already processed tweets
        }
        
        // Count this tweet as analyzed for analytics
        analyzedCount++;
        analytics.timelineTweetsAnalyzed++;
        analytics.totalTweetsAnalyzed++;
        
        console.log(`\nProcessing tweet from @${username}:`);
        console.log(`Content: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '...' : ''}`);
        
        // Analyze tweet content with LLM - more aggressive relevance detection
        let isRelevant = await isRelatedToConcept(tweetText, this.concept);
        
        // Track the user if this is relevant content
        if (isRelevant && username) {
          if (!analytics.relevantUserCounts) {
            analytics.relevantUserCounts = {};
          }
          analytics.relevantUserCounts[username] = (analytics.relevantUserCounts[username] || 0) + 1;
        }
        
        console.log(`Related to ${this.concept}: ${isRelevant ? 'Yes' : 'No'}`);
        
        // Update analytics based on relevance
        if (isRelevant) {
          relevantCount++;
          analytics.totalRelevantTweets++;
        } else {
          analytics.totalIrrelevantTweets++;
        }
        
        // Create status object for this tweet
        const tweetStatus = { 
          processed: true, 
          liked: false, 
          dontLiked: false,
          notRelevant: false,
          fromSearch: false
        };

        if (isRelevant) {
          // For relevant tweets: Apply engagement actions based on settings

          // Always view relevant content (viewing is always enabled)
          // For highly relevant content, spend extra time (high weight in algorithm)
          if (Math.random() < 0.3) {
            await stayOnTweet(this.scraper, tweetId, 120, this); // 2 minutes (high algorithmic weight)
          } else {
            await stayOnTweet(this.scraper, tweetId, 45, this); // 45 seconds
          }
          
          // Like tweets if enabled in settings
          if (this.enableLikes) {
            await this.scraper.likeTweet(tweetId);
            console.log('✓ Liked tweet (relevant to content preferences)');
            tweetStatus.liked = true;
            analytics.timelineLikes++;
            analytics.totalLiked++;
            
            // Track like activity
            this.trackLikeActivity(username, tweetId, tweetText.substring(0, 100));
          } else {
            console.log('ℹ️ Viewed but did not like tweet (likes disabled in settings)');
          }
          
          processedCount++;
          
          // Track user relevance score
          const relevanceScore = analytics.relevantUserCounts[username] || 1;
          
          // Follow user if enabled in settings
          if (this.enableFollows) {
            await considerFollowingUser(this.scraper, username, this);
          }
          
          // Profile visit strategy based on user value
          if (relevanceScore >= 3) {
            // High-value user - always visit profile
            console.log(`🌟 High-value timeline user @${username} found (${relevanceScore} relevant posts)`);
            await visitProfileAndEngage(this.scraper, username, this.concept, this);
          } else if (relevanceScore >= 2 && Math.random() < 0.5) {
            // Medium-value user - visit with higher probability
            await visitProfileAndEngage(this.scraper, username, this.concept, this);
          } else if (relevanceScore === 1 && Math.random() < 0.25) {
            // New relevant user - visit occasionally
            await visitProfileAndEngage(this.scraper, username, this.concept, this);
          }
        } else {
          // For irrelevant tweets: Apply negative feedback if enabled
          if (this.enableDislikes) {
            const feedbackSuccess = await provideAggressiveFeedback(this.scraper, tweetWithFeedback, tweetId, this.concept, this);
            
            if (feedbackSuccess) {
              processedCount++;
              console.log('✓ Applied negative feedback (not matching preferences)');
            } else {
              console.log('⚠ Skipping tweet - no usable feedback actions available');
              skippedCount++;
              continue;
            }
          } else {
            // Just log but don't apply feedback if disabled
            console.log('ℹ️ Skipping irrelevant tweet (negative feedback disabled in settings)');
            processedCount++;
          }
        }
        
        // Add to processed map
        this.processedTweets.set(tweetId, tweetStatus);
        
        // Rate limit between interactions
        await sleep(this.INTERACTION_DELAY);
      }
      
      // Add relevance data point for this cycle
      analytics.addRelevanceDataPoint(relevantCount, analyzedCount);
      
      console.log(`\nProcessing summary: ${processedCount} processed, ${skippedCount} skipped`);
      
      // Optimize memory usage more frequently
      optimizeMemoryUsage(this.processedTweets, 1500);
      
      // Print analytics at regular intervals
      if (this.cycleCount % this.ANALYTICS_INTERVAL === 0) {
        analytics.printAnalytics();
        analytics.printPerformanceInsights();
        
        if (this.onAnalyticsUpdated) {
          this.onAnalyticsUpdated(analytics.getAnalyticsData());
        }
      }
      
      // Adjust refresh delay if adaptive timing is enabled
      if (this.ADAPTIVE_TIMING && this.cycleCount > 5) {
        const optimalTiming = analytics.analyzeOptimalTimings();
        if (optimalTiming) {
          this.refreshDelay = optimalTiming;
          console.log(`\n⚙️ Adjusting refresh delay to ${this.refreshDelay/1000} seconds based on performance`);
        }
      }
      
      console.log(`\nWaiting ${this.refreshDelay/1000} seconds before next refresh...`);
      console.log(`Cycle ${this.cycleCount % this.SEARCH_INTERVAL}/${this.SEARCH_INTERVAL} until next search`);
      
      return true;
    } catch (error) {
      console.error('Error in tuning cycle:', error);
      this.handleError(error);
      return false;
    }
  }

  // Run continuous tuning cycle
  async runTuning() {
    if (!this.isRunning) return;
    
    try {
      await this.runCycle();
      
      // Schedule next cycle if still running
      if (this.isRunning) {
        this.intervalId = setTimeout(() => this.runTuning(), this.refreshDelay);
      }
    } catch (error) {
      console.error('Error in continuous tuning:', error);
      this.handleError(error);
      this.stop();
    }
  }

  // Get current analytics data
  getAnalytics() {
    return analytics.getAnalyticsData();
  }
  
  // Get recent activities
  getRecentActivities() {
    return this.recentActivities;
  }
  
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

  // Handle errors
  handleError(error) {
    if (this.onError) {
      this.onError(error);
    }
  }

  // Check if tuning is active
  isActive() {
    return this.isRunning;
  }

  // Get current concept
  getConcept() {
    return this.concept;
  }
}

// Create and export a default TimelineTuner instance
export const tuner = new TimelineTuner();
export default tuner;