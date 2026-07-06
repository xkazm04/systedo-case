/** Measured LLM quality scores — the output of `npm run llm:quality` baked into
 *  the app by `scripts/bake-quality-scores.mjs`. This is generated data; re-bake
 *  it (don't hand-edit) after a fresh matrix run. See docs/testing/llm-quality-matrix.md.
 *  Baked from a run at 2026-07-06T21:18:52.850Z. */
import type { QualityScores } from "./quality";

export const QUALITY_SCORES: QualityScores = {
  "measuredAt": "2026-07-06T21:18:52.850Z",
  "judge": "claude-sonnet",
  "models": [
    "z-ai/glm-5.2",
    "deepseek/deepseek-v4-flash",
    "xiaomi/mimo-v2.5-pro",
    "openai/gpt-5.4-mini",
    "anthropic/claude-sonnet-5",
    "google/gemini-3.5-flash"
  ],
  "cells": {
    "ads": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 8,
        "tone": 7,
        "score": 7,
        "valid": true,
        "judges": 3
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 9,
        "tone": 7,
        "score": 7.5,
        "valid": true,
        "judges": 3
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": false,
        "judges": 3
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 8,
        "tone": 7,
        "score": 7,
        "valid": true,
        "judges": 3
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 9,
        "tone": 7,
        "score": 6.5,
        "valid": true,
        "judges": 3
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 9,
        "adherence": 8,
        "tone": 6,
        "score": 7.5,
        "valid": true,
        "judges": 3
      }
    },
    "brief": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 3
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 8,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 3
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 7,
        "score": 8,
        "valid": false,
        "judges": 3
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 3
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 9,
        "score": 9,
        "valid": true,
        "judges": 3
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 8,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 3
      }
    },
    "analysis": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 8,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 3
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 3
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 4,
        "adherence": 5.5,
        "tone": 8.5,
        "score": 5.5,
        "valid": true,
        "judges": 2
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 7,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 8,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "campaign-eval": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 10,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      }
    },
    "social": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 4,
        "adherence": 7,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "lead-reply": {
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "repurpose": {
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "local-review-reply": {
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 5,
        "adherence": 9,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "article-draft": {
      "z-ai/glm-5.2": {
        "relevance": 6.5,
        "correctness": 4,
        "adherence": 3.5,
        "tone": 7,
        "score": 4.5,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 5,
        "tone": 9,
        "score": 6.5,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 8,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.5,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 7.5,
        "adherence": 9,
        "tone": 9,
        "score": 8.3,
        "valid": true,
        "judges": 1
      }
    },
    "cohort-diagnosis": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 7,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      }
    },
    "keyword-clusters": {
      "deepseek/deepseek-v4-flash": {
        "relevance": 7,
        "correctness": 3,
        "adherence": 5,
        "tone": 8,
        "score": 5,
        "valid": true,
        "judges": 1
      }
    },
    "comparison-outline": {
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 4,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 5,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      }
    },
    "lp-variant-ideas": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 7,
        "tone": 8,
        "score": 6.5,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 5,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "lead-source-diagnosis": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 7,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 7,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 6,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1
      }
    },
    "chat": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 3,
        "adherence": 7,
        "tone": 8,
        "score": 5,
        "valid": true,
        "judges": 1
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 9,
        "score": 7,
        "valid": false,
        "judges": 1
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 8,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 10,
        "adherence": 9,
        "tone": 9,
        "score": 9,
        "valid": true,
        "judges": 1
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 9,
        "adherence": 6,
        "tone": 8,
        "score": 6.5,
        "valid": true,
        "judges": 1
      }
    }
  }
};

/** True once a matrix run has been baked in (so the UI can hide the scorecard
 *  before any measurement exists). */
export function hasQualityScores(): boolean {
  return QUALITY_SCORES.models.length > 0 && Object.keys(QUALITY_SCORES.cells).length > 0;
}
