export const API_PATHS = {
  AUTH: {
    REGISTER: "/api/auth/register",
    LOGIN: "/api/auth/login",
    REFRESH: "/api/auth/refresh",
    LOGOUT: "/api/auth/logout",
    PROFILE: "/api/auth/profile",
    UPDATE_PASSWORD: "/api/auth/update-password",
  },
  DOCUMENTS: {
    UPLOAD: "/api/documents/upload",
    LIST: "/api/documents",
    GET: (id) => `/api/documents/${id}`,
    DELETE: (id) => `/api/documents/${id}`,
  },
  AI: {
    GENERATE_FLASHCARDS: "/api/ai/generate-flashcards",
    GENERATE_QUIZ: "/api/ai/generate-quiz",
    SUMMARY: "/api/ai/summary",
    EXPLAIN: "/api/ai/explain",
    CHAT: "/api/ai/chat",
    CHAT_HISTORY: (documentId) => `/api/ai/chat-history/${documentId}`,
  },
  FLASHCARDS: {
    LIST: "/api/flashcards",
    LIST_FOR_DOCUMENT: (documentId) => `/api/flashcards/document/${documentId}`,
    GET_SET: (setId) => `/api/flashcards/${setId}`,
    REVIEW_CARD: (setId, cardId) => `/api/flashcards/${setId}/cards/${cardId}/review`,
    FAVORITE_CARD: (setId, cardId) => `/api/flashcards/${setId}/cards/${cardId}/favorite`,
    DELETE_SET: (setId) => `/api/flashcards/${setId}`,
  },
  QUIZZES: {
    LIST: "/api/quizzes",
    LIST_FOR_DOCUMENT: (documentId) => `/api/quizzes/document/${documentId}`,
    GET: (id) => `/api/quizzes/${id}`,
    SUBMIT: (id) => `/api/quizzes/${id}/submit`,
    RESULTS: (id) => `/api/quizzes/${id}/results`,
    DELETE: (id) => `/api/quizzes/${id}`,
  },
  DASHBOARD: {
    OVERVIEW: "/api/dashboard/overview",
  },
  ADMIN: {
    COSTS: "/api/admin/costs",
  },
};
