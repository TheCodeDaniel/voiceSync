'use strict';

// Disable chalk color output in tests for clean assertion strings
process.env.FORCE_COLOR = '0';

// Silence logger output during tests unless explicitly enabled
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'error';
}
