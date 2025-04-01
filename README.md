# Twitter Timeline Tuner

<div align="center">
  <img src="public/images/homepageshow.png" alt="Twitter Timeline Tuner" width="600">
  <p>A powerful tool for optimizing your Twitter timeline algorithm using advanced engagement strategies.</p>
</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## 🌟 Overview

Twitter Timeline Tuner is a sophisticated open-source tool designed to help users train their Twitter timeline algorithm to show more content related to their interests. Unlike simple approaches that only like tweets or use "show less often" feedback, this tool implements a comprehensive strategy that leverages Twitter's full algorithmic signals:

- **🔍 High-value engagement metrics**: Simulates staying on tweets for 2+ minutes, which Twitter's algorithm weights heavily
- **👤 Profile visits and engagement**: Systematically visits profiles of relevant content creators and engages with multiple posts
- **🔄 Strategic content discovery**: Uses search and keyword analysis to find and engage with relevant content
- **👎 Intelligent feedback**: Provides targeted negative feedback for irrelevant content

## ✨ Features

- **🖥️ Web interface**: Easy-to-use dashboard for managing your timeline tuning
- **🧠 Concept-based tuning**: Specify what topics or concepts you want to see more of
- **📊 Advanced analytics**: Track the convergence of your timeline with detailed metrics
- **🔐 OAuth integration**: Simple one-click login with Twitter (no need to copy cookies manually)
- **🍪 Alternative cookie-based authentication**: Option to use your browser cookies as an alternative method
- **🔒 Privacy-focused**: Authentication data is only stored in your browser session, not on any server

## 🚀 Installation

1. Clone this repository:
```bash
git clone https://github.com/your-username/twitter-timeline-tuner.git
cd twitter-timeline-tuner
```

2. Install dependencies:
```bash
npm install
# or if you use pnpm
pnpm install
```

3. Create a `.env` file with the following content:
```
PORT=3000
SESSION_SECRET=your-session-secret
HYPERBOLIC_API_KEY=your-api-key-if-available
TWITTER_CONSUMER_KEY=your-twitter-api-key
TWITTER_CONSUMER_SECRET=your-twitter-api-secret
CALLBACK_URL=http://localhost:3000/auth/twitter/callback
```

> **Note**: To enable OAuth login, you need to:
> - Create a Twitter Developer account at https://developer.twitter.com
> - Create a new project and app
> - Set up the OAuth 1.0a settings and get your consumer key and secret
> - Add the callback URL to your app's settings in the Twitter Developer Portal

4. Start the server:
```bash
npm start
# or
pnpm start
```

## 📖 Usage

1. Open `http://localhost:3000` in your browser
2. Choose one of the login methods:
   - **OAuth Login (Recommended)**: Click "Log in with Twitter" for a seamless one-click authentication
   - **Alternative Method**: Follow the instructions to manually extract and paste your Twitter cookies
3. Enter the concept you want to see more of in your timeline
4. Start the tuning process
5. Monitor progress in the analytics section

## ⚙️ How It Works

The Timeline Tuner uses a multi-pronged approach to optimize your Twitter algorithm:

### Strategic Viewing
The Twitter algorithm assigns high weight (11 points) to tweets that users spend significant time on, especially those viewed for 2+ minutes. Our tuner simulates this deep engagement with relevant content.

### Profile Visits
Visiting a creator's profile and engaging with multiple posts sends a strong signal (12 points) to the algorithm that you value this creator's content.

### Content Discovery
The tuner actively searches for content matching your interests, performing targeted engagement to strengthen the algorithm's understanding of your preferences.

### Negative Feedback
For irrelevant content, the tuner applies the most effective forms of negative feedback, further refining the algorithm.

## 🧪 Testing

Run the test suite with:

```bash
npm test
# or
pnpm test
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Maintainers

- [Maintainer Name](https://github.com/maintainer) - *Initial work*

## ⚠️ Disclaimer

This project is not affiliated with Twitter/X. Use at your own risk and in compliance with Twitter's Terms of Service.

---

<div align="center">
  <p>Made with ❤️ by the open-source community</p>
</div>