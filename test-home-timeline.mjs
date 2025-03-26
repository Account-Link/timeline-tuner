// Use ES modules syntax
import dotenv from 'dotenv';
import { Scraper } from 'agent-twitter-client';

dotenv.config();

// Helper function to find DontLike action in feedbackActions
function findDontLikeAction(feedbackActions, feedbackKeys) {
  if (!feedbackActions) return null;
  
  // First check if there's a dontlike key already
  if (feedbackActions.dontlike) {
    return feedbackActions.dontlike;
  }
  
  // Otherwise, check all keys to find one with feedbackType === 'DontLike'
  for (const key in feedbackActions) {
    const action = feedbackActions[key];
    if (action && action.feedbackType === 'DontLike') {
      return action;
    }
  }
  
  // If nothing found yet, try to find it in the responseObjects directly
  if (feedbackKeys && Array.isArray(feedbackKeys)) {
    console.log('  Found feedbackKeys:', feedbackKeys);
  }
  
  return null;
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

async function testHomeTimeline() {
  try {
    // Initialize the scraper
    const scraper = new Scraper();
    
    // Login with your credentials
    console.log('Logging in...');
    await scraper.login(
      process.env.TWITTER_USERNAME,
      process.env.TWITTER_PASSWORD,
      process.env.TWITTER_EMAIL
    );
    
    console.log('Fetching home timeline...');
    // Fetch home timeline with feedback actions (20 tweets)
    const homeTimelineWithFeedback = await scraper.fetchHomeTimeline(20, []);
    
    console.log(`Retrieved ${homeTimelineWithFeedback.length} tweets`);
    
    // Find a tweet to mark as "don't like"
    let tweetMarkedAsDontLike = false;
    
    // Process each tweet with its feedback actions
    for (const tweetWithFeedback of homeTimelineWithFeedback) {
      // Skip if we've already marked a tweet
      if (tweetMarkedAsDontLike) break;
      
      // Access the tweet data
      const tweetId = tweetWithFeedback.tweet.rest_id;
      console.log(`\nTweet ID: ${tweetId}`);
      
      // Check if there are any feedback actions available
      if (tweetWithFeedback.feedbackActions) {
        console.log('Available feedback actions:');
        
        // List all available feedback types with their keys
        Object.keys(tweetWithFeedback.feedbackActions).forEach(actionType => {
          const action = tweetWithFeedback.feedbackActions[actionType];
          console.log(`- ${actionType}: ${action ? action.feedbackType : 'undefined'}`);
          
          // Print feedbackUrl if available
          if (action && action.feedbackUrl) {
            console.log(`  URL: ${action.feedbackUrl}`);
          }
        });
        
        // Find a DontLike action
        const dontLikeAction = findDontLikeAction(
          tweetWithFeedback.feedbackActions, 
          tweetWithFeedback.tweet.feedbackInfo?.feedbackKeys
        );
        
        if (dontLikeAction) {
          console.log(`Found "Don't Like" action for tweet: ${tweetId}`);
          
          // Extract action_metadata from the feedbackUrl
          const actionMetadata = extractActionMetadata(dontLikeAction.feedbackUrl);
          
          if (actionMetadata) {
            console.log(`Extracted action_metadata: ${actionMetadata}`);
            
            // Mark the tweet as "don't like" using the extracted action_metadata
            console.log(`Marking tweet ${tweetId} as "don't like"...`);
            await scraper.unlikeTweet(tweetId, actionMetadata);
            
            console.log(`Successfully marked tweet as "don't like"!`);
            tweetMarkedAsDontLike = true;
            break;
          }
        } else {
          console.log('No "Don\'t Like" action found for this tweet');
        }
      } else {
        console.log('No feedback actions available for this tweet');
      }
      
      // Show the first few tweets in more detail
      if (homeTimelineWithFeedback.indexOf(tweetWithFeedback) < 3) {
        console.log('\nInspecting tweet in detail:');
        // Check if there's a content.feedbackInfo property
        const content = tweetWithFeedback.tweet.content;
        if (content && content.feedbackInfo) {
          console.log('Content feedbackInfo:', JSON.stringify(content.feedbackInfo, null, 2));
        }
      }
      
      // Only show the first five tweets to avoid overwhelming output
      if (homeTimelineWithFeedback.indexOf(tweetWithFeedback) >= 5) {
        console.log('\n(Showing only the first 5 tweets for brevity)');
        break;
      }
    }
    
    if (!tweetMarkedAsDontLike) {
      console.log('No suitable tweet found to mark as "don\'t like"');
    }
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testHomeTimeline();
