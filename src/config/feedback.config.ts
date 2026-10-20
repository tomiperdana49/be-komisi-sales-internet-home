export const feedbackConfig = {
  // External service that stores/serves feedback entries.
  feedbackUrl: process.env.FEEDBACK_URL,
  // Base URL this app is reachable at, used to build public image URLs.
  appUrl: process.env.APP_URL,
  // Google Chat incoming webhook that announces each new feedback; unset = no chat notification.
  googleChatWebhookUrl: process.env.FEEDBACK_GOOGLE_CHAT_WEBHOOK_URL,
  // The Sheet the feedback lands in, linked from the chat message.
  sheetUrl: process.env.FEEDBACK_SHEET_URL,
};
