/** Measured LLM quality scores — the output of `npm run llm:quality` baked into
 *  the app by `scripts/bake-quality-scores.mjs`. This is generated data; re-bake
 *  it (don't hand-edit) after a fresh matrix run. See docs/testing/llm-quality-matrix.md.
 *  Baked from a run at 2026-07-07T12:17:55.091Z. */
import type { QualityScores } from "./quality";

export const QUALITY_SCORES: QualityScores = {
  "measuredAt": "2026-07-07T12:17:55.091Z",
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
        "correctness": 9,
        "adherence": 9,
        "tone": 6,
        "score": 6,
        "valid": false,
        "judges": 1,
        "costUsd": 0.003589
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 9,
        "adherence": 9,
        "tone": 6,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000082
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.006478
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000809
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 7,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.003658
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 8,
        "tone": 7,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002252
      }
    },
    "brief": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 9,
        "score": 9,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00534
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000243
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 8,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00245
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001174
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00628
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002817
      }
    },
    "analysis": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 7,
        "tone": 5,
        "score": 5.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001261
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7.2,
        "valid": true,
        "judges": 1,
        "costUsd": 0.0002
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002835
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00113
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 6,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004758
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002922
      }
    },
    "campaign-eval": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004469
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 9,
        "score": 7.2,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00028
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.011092
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000884
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005358
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002337
      }
    },
    "social": {
      "z-ai/glm-5.2": {
        "relevance": 5,
        "correctness": 3,
        "adherence": 2,
        "tone": 8,
        "score": 3,
        "valid": false,
        "judges": 1,
        "costUsd": 0.007006
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 8,
        "tone": 7,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.0001
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00432
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001498
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00523
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004496
      }
    },
    "lead-reply": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 8,
        "tone": 7,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005858
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000091
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 6,
        "tone": 8,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001679
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001373
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 8,
        "tone": 7,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005262
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 8,
        "tone": 6,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002933
      }
    },
    "repurpose": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 7,
        "tone": 7,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002484
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000338
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 8,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.003179
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 8,
        "adherence": 6.5,
        "tone": 7.5,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001208
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 8,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.009614
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004983
      }
    },
    "local-review-reply": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005756
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00009
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001509
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001001
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004378
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 9,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002111
      }
    },
    "article-draft": {
      "z-ai/glm-5.2": {
        "relevance": 4,
        "correctness": 2,
        "adherence": 2,
        "tone": 7,
        "score": 2.5,
        "valid": false,
        "judges": 1,
        "costUsd": 0.002938
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 8,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00062
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 6,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00918
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 7,
        "tone": 7,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004517
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.012236
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.011085
      }
    },
    "cohort-diagnosis": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 6.5,
        "tone": 8,
        "score": 7.3,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002608
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00015
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 6.5,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004168
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001766
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.008314
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 6,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.003399
      }
    },
    "keyword-clusters": {
      "z-ai/glm-5.2": {
        "relevance": 10,
        "correctness": 10,
        "adherence": 9,
        "tone": 9,
        "score": 9.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001841
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000046
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 8,
        "correctness": 5,
        "adherence": 5,
        "tone": 6,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004606
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000656
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 8,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.003026
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00144
      }
    },
    "comparison-outline": {
      "z-ai/glm-5.2": {
        "relevance": 9,
        "correctness": 6.5,
        "adherence": 9.5,
        "tone": 8.5,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.006207
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 5,
        "adherence": 7,
        "tone": 8,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000538
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.008022
      },
      "openai/gpt-5.4-mini": {
        "relevance": 8,
        "correctness": 7,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.006368
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7,
        "adherence": 8,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.020596
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.011135
      }
    },
    "lp-variant-ideas": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 4,
        "adherence": 9,
        "tone": 8,
        "score": 6.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.009262
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000142
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 5,
        "adherence": 8,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.007375
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002385
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 7.5,
        "adherence": 9.5,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.009316
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 9,
        "tone": 8,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005333
      }
    },
    "lead-source-diagnosis": {
      "z-ai/glm-5.2": {
        "relevance": 8,
        "correctness": 6,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005177
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 6,
        "tone": 9,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000139
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 9,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.004255
      },
      "openai/gpt-5.4-mini": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001191
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 8,
        "adherence": 7,
        "tone": 9,
        "score": 8,
        "valid": true,
        "judges": 1,
        "costUsd": 0.005516
      },
      "google/gemini-3.5-flash": {
        "relevance": 9,
        "correctness": 9,
        "adherence": 8,
        "tone": 9,
        "score": 8.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.002466
      }
    },
    "chat": {
      "z-ai/glm-5.2": {
        "relevance": 7,
        "correctness": 4,
        "adherence": 8,
        "tone": 8,
        "score": 5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.00115
      },
      "deepseek/deepseek-v4-flash": {
        "relevance": 8,
        "correctness": 4,
        "adherence": 6,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000091
      },
      "xiaomi/mimo-v2.5-pro": {
        "relevance": 5,
        "correctness": 6,
        "adherence": 4,
        "tone": 8,
        "score": 5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000953
      },
      "openai/gpt-5.4-mini": {
        "relevance": 6,
        "correctness": 6,
        "adherence": 7,
        "tone": 8,
        "score": 6,
        "valid": true,
        "judges": 1,
        "costUsd": 0.000621
      },
      "anthropic/claude-sonnet-5": {
        "relevance": 9,
        "correctness": 6,
        "adherence": 7,
        "tone": 8,
        "score": 7,
        "valid": true,
        "judges": 1,
        "costUsd": 0.0028
      },
      "google/gemini-3.5-flash": {
        "relevance": 8,
        "correctness": 9,
        "adherence": 8,
        "tone": 7,
        "score": 7.5,
        "valid": true,
        "judges": 1,
        "costUsd": 0.001079
      }
    }
  }
};

/** True once a matrix run has been baked in (so the UI can hide the scorecard
 *  before any measurement exists). */
export function hasQualityScores(): boolean {
  return QUALITY_SCORES.models.length > 0 && Object.keys(QUALITY_SCORES.cells).length > 0;
}
