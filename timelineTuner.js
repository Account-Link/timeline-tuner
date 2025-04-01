import { Scraper } from 'agent-twitter-client';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { SearchMode } from 'agent-twitter-client';
dotenv.config();

// API key for Hyperbolic API
const HYPERBOLIC_API_KEY = process.env.HYPERBOLIC_API_KEY;
const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz/v1/chat/completions';

// Analytics object to track convergence
const analytics = {
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
  }
};

// LLM-based function to check if text is related to a concept using Hyperbolic API
async function isRelatedToConcept(text, concept) {
  // Fallback to simple keyword matching if text is too short or API key is missing
  if (!text || !HYPERBOLIC_API_KEY) {
    return false;
  }
  
  try {
    // Prepare the message for the LLM
    const promptText = `
    Determine if the following tweet text adheres to my preference of what content/tweet I wanna see: "${concept}". 
    Consider both explicit mentions and implicit references.
    
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
    
    console.log(`LLM judgment for concept "${concept}": ${answer}`);
    return answer.includes('yes');
    
  } catch (error) {
    console.error('Error calling Hyperbolic API:', error.message);
    // Fallback to the simple keyword-based method if the API call fails
    return false;
  }
}

// Helper function to delay execution
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// New function to stay on tweet to signal interest (high weight in Twitter algorithm)
async function stayOnTweet(scraper, tweetId, seconds) {
  try {
    // Log the start of viewing activity
    console.log(`🕰️ Starting to view tweet ${tweetId} for ${seconds} seconds`);
    
    // Record tweet view start time
    const startTime = Date.now();
    
    // For API-based approach, we simulate staying on a tweet
    // Fetch the tweet to ensure it's loaded and cached
    await scraper.getTweet(tweetId);
    
    // Wait for the specified duration 
    await sleep(seconds * 1000);
    
    // Record analytics
    const actualDuration = (Date.now() - startTime) / 1000;
    analytics.totalTimeSpentViewing += actualDuration;
    
    // Twitter's algorithm specifically values staying for 2+ minutes
    if (seconds >= 120) {
      analytics.highValueViewings++;
      console.log(`✓ Completed high-value view of tweet (${seconds} seconds)`);
    } else {
      console.log(`✓ Viewed tweet for ${seconds} seconds`);
    }
    
    return true;
  } catch (error) {
    console.error(`Error during tweet viewing: ${error.message}`);
    return false;
  }
}

// New function to visit user profiles and engage with their content
async function visitProfileAndEngage(scraper, username, concept) {
  const engagementSummary = {
    profileVisited: false,
    tweetsLiked: 0,
    conceptTweetsFound: 0,
    conceptTweetsEngaged: 0
  };
  
  try {
    console.log(`\n👤 Visiting profile for user: @${username}`);
    analytics.profileVisits++;
    
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
        
        // Like the tweet if not already liked
        try {
          await scraper.likeTweet(tweetId);
          engagementSummary.tweetsLiked++;
          engagementSummary.conceptTweetsEngaged++;
          console.log(`✓ Liked tweet from profile: ${text.substring(0, 50)}...`);
          
          // For the first tweet, spend extra time viewing it
          if (i === 0) {
            await stayOnTweet(scraper, tweetId, 60);
          }
          
          analytics.profileEngagements++;
          await sleep(2000); // Space out engagements
        } catch (error) {
          console.error(`Error liking tweet ${tweetId}: ${error.message}`);
        }
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
function findFeedbackAction(tweetWithFeedback, feedbackType) {
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
function findDontLikeAction(tweetWithFeedback) {
  return findFeedbackAction(tweetWithFeedback, 'DontLike');
}

// Helper function to find "NotRelevant" feedback action and extract metadata
function findNotRelevantAction(tweetWithFeedback) {
  return findFeedbackAction(tweetWithFeedback, 'NotRelevant');
}

// Helper function to extract action_metadata from a feedbackUrl
function extractActionMetadata(feedbackUrl) {
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
async function sendFeedback(scraper, tweetId, feedbackAction, actionDescription) {
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
async function searchAndLikeRelevantTweets(scraper, concept, processedTweets, maxTweets = 30) {
  console.log(`\n📡 Searching for tweets related to "${concept}"...`);
  analytics.searches++;
  
  try {
    // Create multiple search queries to diversify results
    const hashtagVersion = concept.replace(/\s+/g, '');
    const searchQueries = [
      { query: `${concept}`, label: "exact concept" },
      { query: `#${hashtagVersion}`, label: "hashtag" },
      { query: `${concept} filter:links`, label: "with links" },
      { query: `${concept} -filter:replies`, label: "excluding replies" },
      { query: `${concept} min_faves:5`, label: "min likes 5" }
    ];
    
    let totalLikedCount = 0;
    let totalAnalyzedCount = 0;
    
    // Process each search query
    for (const searchItem of searchQueries) {
      if (totalLikedCount >= maxTweets) break;
      
      console.log(`\n🔍 Searching for "${searchItem.label}": ${searchItem.query}`);
      
      // Get search results
      const searchResultsPage = await scraper.fetchSearchTweets(
        searchItem.query, 
        Math.min(20, maxTweets - totalLikedCount), 
        SearchMode.Latest
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
            // Like the tweet
            await scraper.likeTweet(tweetId);
            console.log(`✓ Liked search result tweet (relevant to concept)`);
            likedCount++;
            totalLikedCount++;
            analytics.searchLikes++;
            analytics.totalLiked++;
            analytics.totalRelevantTweets++;
            
            // For every 3rd relevant tweet, spend significant time viewing it (120+ seconds)
            // This is important for the algorithm
            if (likedCount % 3 === 0) {
              await stayOnTweet(scraper, tweetId, 120);
            }
            
            // Record that we've processed this tweet
            processedTweets.set(tweetId, {
              processed: true,
              liked: true,
              dontLiked: false,
              notRelevant: false,
              fromSearch: true
            });
            
            // Track the user who posted relevant content
            analytics.relevantUserCounts[username] = (analytics.relevantUserCounts[username] || 0) + 1;
            
            // For users who consistently post good content, visit their profile occasionally
            if (analytics.relevantUserCounts[username] >= 2 && Math.random() < 0.3) {
              await visitProfileAndEngage(scraper, username, concept);
            } else {
              // Consider following users with relevant content
              await considerFollowingUser(scraper, username);
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
async function considerFollowingUser(scraper, username) {
  if (!analytics.relevantUserCounts || !username) return;
  
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
      
      return true;
    } catch (error) {
      console.error(`Error following user ${username}:`, error.message);
    }
  }
  return false;
}

// New function to provide more aggressive feedback
async function provideAggressiveFeedback(scraper, tweetWithFeedback, tweetId, concept) {
  const tweet = tweetWithFeedback.tweet;
  const tweetText = tweet.legacy?.full_text || '';
  
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
function optimizeMemoryUsage(processedTweets, maxSize = 1000) {
  if (processedTweets.size <= maxSize) return;
  
  // Keep only the most recent tweets
  const tweets = Array.from(processedTweets.entries());
  processedTweets.clear();
  
  // Keep tweets from the end (most recent)
  tweets.slice(-maxSize).forEach(([id, status]) => processedTweets.set(id, status));
  
  console.log(`🧹 Memory optimized: Reduced processed tweets from ${tweets.length} to ${processedTweets.size}`);
}

async function main() {
  const scraper = new Scraper();

  // only show tweets that contain the concept
  const concept = "Turkish Ice Cream";
  
  // Set rate limits
  const REFRESH_DELAY = 30000; // 30 seconds between timeline refreshes
  const INTERACTION_DELAY = 2000; // 2 seconds between likes/dislikes
  const SEARCH_INTERVAL = 3; // How many home timeline refreshes before doing a search again 
  const MAX_SEARCH_TWEETS = 40; // Maximum number of search results to process
  const ANALYTICS_INTERVAL = 1; // How often to print analytics (every N cycles)
  const TIMELINE_FETCH_COUNT = 100; // Number of tweets to fetch from timeline
  const ADAPTIVE_TIMING = true; // Whether to use adaptive timing based on performance
  const PROFILE_VISIT_INTERVAL = 5; // How often to visit profiles (every N cycles)
  
  // Check if Hyperbolic API key is available
  if (!HYPERBOLIC_API_KEY) {
    console.warn('⚠️ HYPERBOLIC_API_KEY not found in environment variables. Using fallback keyword matching.');
  } else {
    console.log('✓ Using Hyperbolic API for LLM-based relevance judgment');
  }
  
  // Keep track of processed tweets and their status
  const processedTweets = new Map(); // Map<tweetId, {processed: boolean, liked: boolean, dontLiked: boolean}>

  // v1 login
  await scraper.login(
    process.env.TWITTER_USERNAME,
    process.env.TWITTER_PASSWORD,
    process.env.TWITTER_EMAIL,
  );
  
  console.log('Logged in successfully! Starting timeline monitoring...');
  
  // Counter for search intervals
  let cycleCount = 0;
  let currentRefreshDelay = REFRESH_DELAY;
  
  // Initial search to bootstrap the process
  await searchAndLikeRelevantTweets(scraper, concept, processedTweets, MAX_SEARCH_TWEETS);
  
  // Continuous monitoring loop
  while (true) {
      cycleCount++;
      analytics.cycles++;
      
      // Periodically search for and like tweets related to the concept (more frequent)
      if (cycleCount % SEARCH_INTERVAL === 0) {
        await searchAndLikeRelevantTweets(scraper, concept, processedTweets, MAX_SEARCH_TWEETS);
      }
      
      // Periodically visit profiles of relevant users for deeper engagement
      if (cycleCount % PROFILE_VISIT_INTERVAL === 0 && analytics.relevantUserCounts) {
        const topUsers = Object.entries(analytics.relevantUserCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
          
        if (topUsers.length > 0) {
          const randomUser = topUsers[Math.floor(Math.random() * topUsers.length)];
          console.log(`\n🔄 Selected user @${randomUser[0]} for profile visit (${randomUser[1]} relevant tweets)`);
          await visitProfileAndEngage(scraper, randomUser[0], concept);
        }
      }
      
      // Fetch more tweets from the home timeline
      const homeTimelineWithFeedback = await scraper.fetchHomeTimeline(TIMELINE_FETCH_COUNT, []);
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
        if (processedTweets.has(tweetId)) {
          const tweetStatus = processedTweets.get(tweetId);
          
          continue; // Skip already processed tweets
        }
        
        // Count this tweet as analyzed for analytics
        analyzedCount++;
        analytics.timelineTweetsAnalyzed++;
        analytics.totalTweetsAnalyzed++;
        
        console.log(`\nProcessing tweet from @${username}:`);
        console.log(`Content: ${tweetText.slice(0, 100)}${tweetText.length > 100 ? '...' : ''}`);
        
        // Analyze tweet content with LLM - more aggressive relevance detection
        let isRelevant = await isRelatedToConcept(tweetText, concept);
        
        // Track the user if this is relevant content
        if (isRelevant && username) {
          if (!analytics.relevantUserCounts) {
            analytics.relevantUserCounts = {};
          }
          analytics.relevantUserCounts[username] = (analytics.relevantUserCounts[username] || 0) + 1;
        }
        
        console.log(`Related to ${concept}: ${isRelevant ? 'Yes' : 'No'}`);
        
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
          // For relevant tweets: Like them and spend significant time viewing
          await scraper.likeTweet(tweetId);
          console.log('✓ Liked tweet (relevant to concept)');
          tweetStatus.liked = true;
          processedCount++;
          analytics.timelineLikes++;
          analytics.totalLiked++;
          
          // For highly relevant content, spend extra time (high weight in algorithm)
          if (Math.random() < 0.3) {
            await stayOnTweet(scraper, tweetId, 120); // 2 minutes (high algorithmic weight)
          } else {
            await stayOnTweet(scraper, tweetId, 45); // 45 seconds
          }
          
          // Consider following the user
          await considerFollowingUser(scraper, username);
          
          // Occasionally visit the profile (high algorithmic weight)
          if (Math.random() < 0.15) {
            await visitProfileAndEngage(scraper, username, concept);
          }
        } else {
          // For irrelevant tweets: Apply more aggressive feedback
          const feedbackSuccess = await provideAggressiveFeedback(scraper, tweetWithFeedback, tweetId, concept);
          
          if (feedbackSuccess) {
            processedCount++;
          } else {
            console.log('⚠ Skipping tweet - no usable feedback actions available');
            skippedCount++;
            continue;
          }
        }
        
        // Add to processed map
        processedTweets.set(tweetId, tweetStatus);
        
        // Rate limit between interactions
        await sleep(INTERACTION_DELAY);
      }
      
      // Add relevance data point for this cycle
      analytics.addRelevanceDataPoint(relevantCount, analyzedCount);
      
      console.log(`\nProcessing summary: ${processedCount} processed, ${skippedCount} skipped`);
      
      // Optimize memory usage more frequently
      optimizeMemoryUsage(processedTweets, 1500);
      
      // Print analytics at regular intervals
      if (cycleCount % ANALYTICS_INTERVAL === 0) {
        analytics.printAnalytics();
        analytics.printPerformanceInsights();
      }
      
      // Adjust refresh delay if adaptive timing is enabled
      if (ADAPTIVE_TIMING && cycleCount > 5) {
        const optimalTiming = analytics.analyzeOptimalTimings();
        if (optimalTiming) {
          currentRefreshDelay = optimalTiming;
          console.log(`\n⚙️ Adjusting refresh delay to ${currentRefreshDelay/1000} seconds based on performance`);
        }
      }
      
      console.log(`\nWaiting ${currentRefreshDelay/1000} seconds before next refresh...`);
      console.log(`Cycle ${cycleCount % SEARCH_INTERVAL}/${SEARCH_INTERVAL} until next search`);
      await sleep(currentRefreshDelay);
  }
}

main().catch(console.error);