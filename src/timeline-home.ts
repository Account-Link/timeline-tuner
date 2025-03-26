import { requestApi } from './api';
import { TwitterAuth } from './auth';
import { ApiError } from './errors';
import { TimelineInstruction } from './timeline-v2';

export interface HomeTimelineResponse {
  data?: {
    home: {
      home_timeline_urt: {
        instructions: TimelineInstruction[];
        responseObjects?: {
          feedbackActions?: {
            key: string;
            value: {
              feedbackType: string;
              prompt: string;
              confirmation: string;
              feedbackUrl: string;
              hasUndoAction: boolean;
              childKeys?: string[];
              icon?: string;
              clientEventInfo?: {
                action: string;
                element: string;
              };
            };
          }[];
        };
      };
    };
  };
}

export interface TweetWithFeedback {
  tweet: any;
  feedbackActions?: {
    dontLike?: {
      feedbackType: string;
      prompt: string;
      confirmation: string;
      feedbackUrl: string;
      hasUndoAction: boolean;
      actionMetadata: string;
    };
    [key: string]: any;
  };
}

export async function fetchHomeTimeline(
  count: number,
  seenTweetIds: string[],
  auth: TwitterAuth,
): Promise<TweetWithFeedback[]> {
  const variables = {
    count,
    includePromotedContent: true,
    latestControlAvailable: true,
    requestContext: 'launch',
    withCommunity: true,
    seenTweetIds,
  };

  const features = {
    rweb_tipjar_consumption_enabled: true,
    responsive_web_graphql_exclude_directive_enabled: true,
    verified_phone_label_enabled: false,
    creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true,
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true,
    articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true,
    graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true,
    longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true,
    tweet_awards_web_tipping_enabled: false,
    creator_subscriptions_quote_tweet_preview_enabled: false,
    freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true,
    tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled:
      true,
    rweb_video_timestamps_enabled: true,
    longform_notetweets_rich_text_read_enabled: true,
    longform_notetweets_inline_media_enabled: true,
    responsive_web_enhance_cards_enabled: false,
  };

  const res = await requestApi<HomeTimelineResponse>(
    `https://x.com/i/api/graphql/HJFjzBgCs16TqxewQOeLNg/HomeTimeline?variables=${encodeURIComponent(
      JSON.stringify(variables),
    )}&features=${encodeURIComponent(JSON.stringify(features))}`,
    auth,
    'GET',
  );

  if (!res.success) {
    if (res.err instanceof ApiError) {
      console.error('Error details:', res.err.data);
    }
    throw res.err;
  }

  const home = res.value?.data?.home.home_timeline_urt;
  
  if (!home || !home.instructions) {
    return [];
  }

  // Get feedback actions from response objects
  const feedbackActionsMap = new Map();
  if (home.responseObjects && home.responseObjects.feedbackActions) {
    for (const action of home.responseObjects.feedbackActions) {
      feedbackActionsMap.set(action.key, action.value);
    }
  }

  const entries: any[] = [];

  for (const instruction of home.instructions) {
    if (instruction.type === 'TimelineAddEntries') {
      for (const entry of instruction.entries ?? []) {
        entries.push(entry);
      }
    }
  }
  
  // Create tweets with associated feedback actions
  const tweetsWithFeedback: TweetWithFeedback[] = [];

  for (const entry of entries) {
    const tweet = entry.content.itemContent?.tweet_results?.result;
    if (!tweet) continue;

    const tweetWithFeedback: TweetWithFeedback = { tweet };
    
    // Get feedback keys from the entry if available
    const feedbackKeys = entry.content.feedbackInfo?.feedbackKeys;
    if (feedbackKeys && feedbackKeys.length > 0) {
      const feedbackActions: any = {};
      
      for (const key of feedbackKeys) {
        const action = feedbackActionsMap.get(key);
        if (action) {
          // Extract action_metadata from feedbackUrl
          let actionMetadata = '';
          if (action.feedbackUrl) {
            const url = new URL('https://x.com' + action.feedbackUrl);
            actionMetadata = url.searchParams.get('action_metadata') || '';
          }
          
          // Add the action to the feedback actions with its type as the key
          feedbackActions[action.feedbackType.toLowerCase()] = {
            ...action,
            actionMetadata
          };
        }
      }
      
      tweetWithFeedback.feedbackActions = feedbackActions;
    }
    
    tweetsWithFeedback.push(tweetWithFeedback);
  }

  return tweetsWithFeedback;
}
